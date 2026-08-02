"use client";

/**
 * 파티클 이미터 (SCENES.md 1절) — 스파크 / 재 / 혈흔.
 *
 * One `Points` draw call per burst. Trajectories are integrated *analytically*
 * from the cinematic clock (`stage.t`), never accumulated frame to frame, so a
 * dropped frame can never desync the effect and every screenshot is
 * reproducible. Budget: ~360 particles across the whole cinematic
 * (CLAUDE.md 성능 — 수백 개 수준, 수천 금지).
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  type Points,
  ShaderMaterial,
} from "three";
import { mulberry32, stage } from "./stage";

export interface BurstSpec {
  count: number;
  /** world-space emitter origin */
  origin: readonly [number, number, number];
  /** cinematic time (seconds) at which the burst fires */
  t0: number;
  /** per-particle lifetime */
  life: number;
  /** spread of individual birth times across the burst */
  stagger?: number;
  speedMin: number;
  speedMax: number;
  /** 0 = full sphere, 1 = straight up */
  upBias: number;
  /** world units / s² (negative = falls) */
  gravity: number;
  /** exponential velocity damping */
  drag: number;
  size: number;
  sizeJitter?: number;
  colorA: string;
  colorB: string;
  additive?: boolean;
  /** rotating square sprites instead of soft dots (재 파티클) */
  square?: boolean;
  spin?: number;
  /** initial radial scatter around the origin */
  radius?: number;
  seed: number;
  /** floor level — particles stop falling through the board */
  floor?: number;
}

const vertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute float aAngle;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying float vAngle;
  varying vec3 vColor;

  void main() {
    vAlpha = aAlpha;
    vAngle = aAngle;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uSquare;
  varying float vAlpha;
  varying float vAngle;
  varying vec3 vColor;

  void main() {
    if (vAlpha <= 0.001) discard;
    vec2 uv = gl_PointCoord - 0.5;
    float m;
    if (uSquare > 0.5) {
      float c = cos(vAngle);
      float s = sin(vAngle);
      vec2 r = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
      m = 1.0 - step(0.33, max(abs(r.x), abs(r.y * 0.72)));
    } else {
      float d = length(uv);
      m = smoothstep(0.5, 0.03, d);
      m = pow(m, 1.5);
    }
    if (m < 0.01) discard;
    gl_FragColor = vec4(vColor, vAlpha * m);
    #include <colorspace_fragment>
  }
`;

/** A single deterministic particle burst driven by the cinematic clock. */
export function ParticleBurst({ spec }: { spec: BurstSpec }) {
  const pointsRef = useRef<Points>(null);
  const viewportHeight = useThree((s) => s.size.height);
  const pixelRatio = useThree((s) => s.viewport.dpr);
  const fov = useThree((s) => (s.camera as { fov?: number }).fov ?? 38);

  const sim = useMemo(() => {
    const rnd = mulberry32(spec.seed);
    const n = spec.count;
    const vel = new Float32Array(n * 3);
    const off = new Float32Array(n * 3);
    const birth = new Float32Array(n);
    const life = new Float32Array(n);
    const spin = new Float32Array(n);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 3);

    const ca = new Color(spec.colorA);
    const cb = new Color(spec.colorB);
    const stagger = spec.stagger ?? 0;
    const radius = spec.radius ?? 0;
    const jitter = spec.sizeJitter ?? 0.45;

    for (let i = 0; i < n; i += 1) {
      // upward-biased hemisphere
      const u = rnd() * 2 - 1;
      const phi = rnd() * Math.PI * 2;
      const y = u * (1 - spec.upBias) + spec.upBias * (0.35 + rnd() * 0.65);
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const dx = Math.cos(phi) * r;
      const dz = Math.sin(phi) * r;
      const speed = spec.speedMin + rnd() * (spec.speedMax - spec.speedMin);

      vel[i * 3] = dx * speed;
      vel[i * 3 + 1] = y * speed;
      vel[i * 3 + 2] = dz * speed;

      off[i * 3] = dx * radius * rnd();
      off[i * 3 + 1] = (rnd() - 0.2) * radius * 0.6;
      off[i * 3 + 2] = dz * radius * rnd();

      birth[i] = spec.t0 + rnd() * stagger;
      life[i] = spec.life * (0.65 + rnd() * 0.6);
      spin[i] = (rnd() - 0.5) * (spec.spin ?? 0);
      size[i] = spec.size * (1 - jitter / 2 + rnd() * jitter);

      const mix = rnd();
      color[i * 3] = ca.r + (cb.r - ca.r) * mix;
      color[i * 3 + 1] = ca.g + (cb.g - ca.g) * mix;
      color[i * 3 + 2] = ca.b + (cb.b - ca.b) * mix;
    }

    const geometry = new BufferGeometry();
    const position = new Float32Array(n * 3);
    const alpha = new Float32Array(n);
    const angle = new Float32Array(n);
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("aAlpha", new BufferAttribute(alpha, 1));
    geometry.setAttribute("aSize", new BufferAttribute(size, 1));
    geometry.setAttribute("aAngle", new BufferAttribute(angle, 1));
    geometry.setAttribute("aColor", new BufferAttribute(color, 3));
    geometry.boundingSphere = null;
    geometry.frustumCulled = false;

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: spec.additive ? AdditiveBlending : NormalBlending,
      uniforms: {
        uScale: { value: 300 },
        uSquare: { value: spec.square ? 1 : 0 },
      },
    });

    return { geometry, material, vel, off, birth, life, spin, position, alpha, angle, n };
  }, [spec]);

  useMemo(
    () => () => {
      sim.geometry.dispose();
      sim.material.dispose();
    },
    [sim],
  );

  useFrame(() => {
    const t = stage.t;
    const { n, vel, off, birth, life, spin, position, alpha, angle } = sim;
    const [ox, oy, oz] = spec.origin;
    const drag = Math.max(0.0001, spec.drag);
    const floor = spec.floor ?? 0.012;

    for (let i = 0; i < n; i += 1) {
      const age = t - birth[i];
      const l = life[i];
      if (age < 0 || age > l) {
        alpha[i] = 0;
        continue;
      }
      // v(t) = v0·e^(-k·t) ; x(t) = v0·(1 - e^(-k·t))/k + ½·g·t²
      const decay = (1 - Math.exp(-drag * age)) / drag;
      const px = ox + off[i * 3] + vel[i * 3] * decay;
      let py =
        oy + off[i * 3 + 1] + vel[i * 3 + 1] * decay + 0.5 * spec.gravity * age * age;
      const pz = oz + off[i * 3 + 2] + vel[i * 3 + 2] * decay;
      if (py < floor) py = floor;

      position[i * 3] = px;
      position[i * 3 + 1] = py;
      position[i * 3 + 2] = pz;
      angle[i] = spin[i] * age;

      const k = age / l;
      const fadeIn = Math.min(1, age / 0.045);
      alpha[i] = fadeIn * Math.pow(1 - k, 1.5);
    }

    sim.geometry.attributes.position.needsUpdate = true;
    sim.geometry.attributes.aAlpha.needsUpdate = true;
    sim.geometry.attributes.aAngle.needsUpdate = true;

    // gl_PointSize is in framebuffer pixels — convert world size → pixels
    const halfFov = (fov * Math.PI) / 360;
    sim.material.uniforms.uScale.value =
      (viewportHeight * pixelRatio) / (2 * Math.tan(halfFov));
  });

  return (
    <points
      ref={pointsRef}
      geometry={sim.geometry}
      material={sim.material}
      frustumCulled={false}
      renderOrder={6}
    />
  );
}

export default ParticleBurst;
