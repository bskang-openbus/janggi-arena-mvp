/**
 * 디졸브 셰이더 (SCENES.md 1절) — 노이즈 임계값 기반 소멸 + 경계선 발광.
 *
 * A hand-written `ShaderMaterial` (not a patched MeshStandardMaterial) so the
 * threshold, the emissive edge band and the faction colours are all explicit
 * uniforms. Lighting is a cheap wrap-lambert plus a fresnel rim, which is all
 * this needs: the mesh only ever appears inside the darkened cinematic.
 *
 * Uniforms are parameterised per SCENES.md: base colour = 진영색,
 * edge colour = 주홍(소멸) — both settable so P4 can retint per piece.
 */
import {
  Color,
  DoubleSide,
  NormalBlending,
  ShaderMaterial,
  type Texture,
} from "three";

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uProgress;     // 0 = intact, 1 = fully gone
  uniform float uEdge;         // width of the glowing boundary band
  uniform vec3  uColor;        // base tint (faction body colour)
  uniform vec3  uEdgeColor;    // 경계선 발광 — 주홍
  uniform vec3  uEmissive;     // steady self-illumination before dissolving
  uniform float uEmissiveGain;
  uniform float uOpacity;
  uniform float uNoiseScale;
  uniform float uYBase;        // world Y where the piece starts
  uniform float uYSpan;        // piece height, for the upward sweep bias
  uniform float uUseMap;
  uniform sampler2D uMap;

  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying vec3 vViewDir;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      s += a * vnoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return s / 0.875;
  }

  void main() {
    vec4 base = vec4(uColor, 1.0);
    if (uUseMap > 0.5) {
      vec4 tex = texture2D(uMap, vUv);
      if (tex.a < 0.04) discard;
      base = vec4(tex.rgb, tex.a);
    }

    // Noise field, biased so the piece crumbles from the base upward.
    float h = clamp((vWorldPos.y - uYBase) / max(uYSpan, 0.0001), 0.0, 1.0);
    float n = fbm(vWorldPos * uNoiseScale);
    float field = n * 0.70 + h * 0.30;

    // Threshold sweeps past the whole 0..1 field range, plus the edge band.
    float p = uProgress * (1.0 + uEdge * 2.0) - uEdge;
    if (field < p) discard;

    float lam = 0.34 + 0.66 * max(dot(vNormalW, normalize(vec3(0.35, 1.0, 0.5))), 0.0);
    float fres = pow(1.0 - clamp(dot(vNormalW, vViewDir), 0.0, 1.0), 2.4);

    vec3 col = base.rgb * lam + uEmissive * (uEmissiveGain + fres * 0.9);

    // 경계선 주홍 발광 — hottest right at the dissolving edge.
    float edge = 1.0 - smoothstep(0.0, uEdge, field - p);
    col += uEdgeColor * pow(edge, 1.6) * 3.4;

    gl_FragColor = vec4(col, base.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

export interface DissolveOptions {
  color: string;
  edgeColor: string;
  emissive: string;
  emissiveGain?: number;
  map?: Texture | null;
  noiseScale?: number;
  edge?: number;
  yBase?: number;
  ySpan?: number;
  opacity?: number;
}

export type DissolveMaterial = ShaderMaterial & {
  setProgress(p: number): void;
};

export function createDissolveMaterial(
  opts: DissolveOptions,
): DissolveMaterial {
  const mat = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    blending: NormalBlending,
    side: opts.map ? DoubleSide : DoubleSide,
    uniforms: {
      uProgress: { value: 0 },
      uEdge: { value: opts.edge ?? 0.09 },
      uColor: { value: new Color(opts.color) },
      uEdgeColor: { value: new Color(opts.edgeColor) },
      uEmissive: { value: new Color(opts.emissive) },
      uEmissiveGain: { value: opts.emissiveGain ?? 0.35 },
      uOpacity: { value: opts.opacity ?? 1 },
      uNoiseScale: { value: opts.noiseScale ?? 7.5 },
      uYBase: { value: opts.yBase ?? 0 },
      uYSpan: { value: opts.ySpan ?? 0.4 },
      uUseMap: { value: opts.map ? 1 : 0 },
      uMap: { value: opts.map ?? null },
    },
  }) as DissolveMaterial;

  mat.setProgress = (p: number) => {
    mat.uniforms.uProgress.value = p;
  };
  return mat;
}
