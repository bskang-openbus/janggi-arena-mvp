import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";
import { BOARD_COLORS, glyphFor, SIDE_THEME } from "./palette";
import type { PieceType, Side } from "./types";

/* ------------------------------------------------------------------ */
/* Deterministic value noise (no external assets, no dependencies)     */
/* ------------------------------------------------------------------ */

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177) ^ Math.imul(seed | 0, 2246822519);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 131);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const canBuild = () => typeof document !== "undefined";

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function finish(canvas: HTMLCanvasElement, srgb = true): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function octagonPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    // vertex at the top of the canvas, matching the cylinder's 8 segments
    const x = cx + r * Math.sin(a);
    const y = cy - r * Math.cos(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* Board surface — procedural wood with the grain along the long axis  */
/* ------------------------------------------------------------------ */

let boardTop: Texture | null = null;

export function getBoardTopTexture(): Texture | null {
  if (!canBuild()) return null;
  if (boardTop) return boardTop;

  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const [dr, dg, db] = BOARD_COLORS.woodDark;
  const [lr, lg, lb] = BOARD_COLORS.woodLight;

  for (let py = 0; py < size; py += 1) {
    const v = py / size;
    for (let px = 0; px < size; px += 1) {
      const u = px / size;

      // Growth rings running down the long axis. The low-frequency warp is
      // what keeps the band spacing irregular (an even sine reads as fabric).
      const s = u + v * 0.07; // slight drift so the grain isn't axis-aligned
      const warpA = fbm(s * 1.3, v * 0.6, 17, 4);
      const warpB = fbm(s * 5.5, v * 2.2, 29, 3);
      const phase = s * 26 + warpA * 17 + warpB * 2.4;
      let ring = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      ring = Math.pow(ring, 0.72);

      // Fine fibres + broad tonal drift dominate the final value.
      const fibre = fbm(s * 260, v * 7, 53, 2);
      const macro = fbm(s * 2.2, v * 2.8, 91, 4);
      let t = ring * 0.3 + fibre * 0.16 + macro * 0.54;

      // A few darker streaks for character.
      const streak = fbm(s * 8, v * 1.5, 211, 3);
      t *= 0.88 + 0.22 * streak;

      t = Math.min(1, Math.max(0, t));

      const i = (py * size + px) * 4;
      data[i] = dr + (lr - dr) * t;
      data[i + 1] = dg + (lg - dg) * t;
      data[i + 2] = db + (lb - db) * t;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Warm burnish toward the centre, aged/darkened toward the rim.
  const grd = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.7,
  );
  grd.addColorStop(0, "rgba(255,206,140,0.08)");
  grd.addColorStop(0.55, "rgba(0,0,0,0)");
  grd.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // Stained border band framing the printed grid.
  ctx.strokeStyle = "rgba(24,12,4,0.5)";
  ctx.lineWidth = size * 0.035;
  ctx.strokeRect(size * 0.02, size * 0.02, size * 0.96, size * 0.96);

  boardTop = finish(canvas);
  return boardTop;
}

/* ------------------------------------------------------------------ */
/* Greyscale wood grain — tinted by the material colour                */
/* ------------------------------------------------------------------ */

const grainCache = new Map<string, Texture>();

export function getGrainTexture(
  seed: number,
  scale = 1,
  contrast = 1,
): Texture | null {
  if (!canBuild()) return null;
  const key = `${seed}:${scale}:${contrast}`;
  const cached = grainCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py += 1) {
    const v = py / size;
    for (let px = 0; px < size; px += 1) {
      const u = px / size;
      const warp = fbm(u * 2.4 * scale, v * 1.2 * scale, seed, 3);
      const rings = Math.sin((v * 9 * scale + warp * 5) * Math.PI);
      let t = 0.5 + 0.5 * rings;
      const fibre = fbm(u * 20 * scale, v * 90 * scale, seed + 7, 2);
      t = t * 0.55 + fibre * 0.45;
      t = 0.5 + (t - 0.5) * contrast;
      t = Math.min(1, Math.max(0, t));
      const g = 118 + t * 137;
      const i = (py * size + px) * 4;
      data[i] = g;
      data[i + 1] = g * 0.985;
      data[i + 2] = g * 0.96;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = finish(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  grainCache.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Engraved hanja face plate                                           */
/* ------------------------------------------------------------------ */

const GLYPH_FONT =
  '"Nanum Myeongjo", "AppleMyungjo", "Apple SD Gothic Neo", "Songti SC", "STSong", "Hiragino Mincho ProN", "Batang", serif';

const glyphCache = new Map<string, Texture>();

/**
 * Transparent RGBA plate laid on top of the octagonal prism:
 * recessed rim shading + glowing octagon outline + engraved hanja.
 * The glyph colour doubles as the emissiveMap, so the character glows.
 */
export function getGlyphTexture(
  type: PieceType,
  side: Side,
  emphasis = false,
): Texture | null {
  if (!canBuild()) return null;
  const key = `${type}:${side}:${emphasis ? 1 : 0}`;
  const cached = glyphCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const theme = SIDE_THEME[side];
  const accent = emphasis ? theme.accentHot : theme.accent;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.472; // matches the prism radius (plane is 2r/0.944 wide)

  ctx.clearRect(0, 0, size, size);

  // Recessed rim: darkens the wood cap toward the octagon edge.
  ctx.save();
  octagonPath(ctx, cx, cy, r);
  ctx.clip();
  const shade = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(0.62, "rgba(0,0,0,0.12)");
  shade.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  // Side-colour wash so the piece reads as 초/한 even at a glance.
  ctx.globalAlpha = emphasis ? 0.3 : 0.2;
  ctx.fillStyle = theme.bodyEmissive;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Glowing octagonal rim.
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = emphasis ? 14 : 8;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.88;
  octagonPath(ctx, cx, cy, r * 0.94);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // chiselled inner bevel
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = "#0d0906";
  ctx.lineWidth = 3;
  octagonPath(ctx, cx, cy, r * 0.84);
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  octagonPath(ctx, cx, cy, r * 0.8);
  ctx.stroke();
  ctx.restore();

  // Engraved hanja: dark chisel shadow, then the glowing inlay.
  const glyph = glyphFor(type, side);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(size * 0.5)}px ${GLYPH_FONT}`;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#07040a";
  ctx.fillText(glyph, cx + 3, cy + 4);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = emphasis ? 20 : 11;
  ctx.fillStyle = accent;
  ctx.fillText(glyph, cx, cy);
  ctx.shadowBlur = 0;
  ctx.fillStyle = theme.accentHot;
  ctx.globalAlpha = emphasis ? 0.5 : 0.32;
  ctx.fillText(glyph, cx - 1, cy - 1.5);
  ctx.restore();

  const tex = finish(canvas);
  glyphCache.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Small utility textures                                              */
/* ------------------------------------------------------------------ */

let trailTex: Texture | null = null;

/** Left→right alpha ramp used for the last-move afterglow streak. */
export function getTrailTexture(): Texture | null {
  if (!canBuild()) return null;
  if (trailTex) return trailTex;
  const w = 256;
  const h = 32;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const grd = ctx.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, "rgba(255,255,255,0.0)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grd.addColorStop(0.85, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0.15)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  // soften the long edges
  const soft = ctx.createLinearGradient(0, 0, 0, h);
  soft.addColorStop(0, "rgba(0,0,0,1)");
  soft.addColorStop(0.5, "rgba(0,0,0,0)");
  soft.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  trailTex = finish(canvas);
  return trailTex;
}

let glowTex: Texture | null = null;

/** Soft radial falloff used for ground glows (additive). */
export function getGlowTexture(): Texture | null {
  if (!canBuild()) return null;
  if (glowTex) return glowTex;
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const grd = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grd.addColorStop(0.7, "rgba(255,255,255,0.08)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  glowTex = finish(canvas);
  return glowTex;
}
