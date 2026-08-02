/**
 * Procedural textures for the capture cinematic (P3).
 * Canvas only — CLAUDE.md 절대 규칙 3 forbids any downloaded asset.
 *
 * Everything is drawn in white/grey with alpha so the material `color`
 * uniform can tint it per faction (초 청록 / 한 진홍) at no extra cost.
 */
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
} from "three";
import { mulberry32 } from "./stage";

const canBuild = () => typeof document !== "undefined";

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function finish(canvas: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/* 소환진 — 팔괘 문양 (SCENES.md 1절)                                   */
/* ------------------------------------------------------------------ */

/** 팔괘: three lines each, `1` solid (양) / `0` broken (음), bottom line first. */
const TRIGRAMS: [number, number, number][] = [
  [1, 1, 1], // 건 ☰
  [0, 1, 1], // 태 ☱
  [1, 0, 1], // 리 ☲
  [0, 0, 1], // 진 ☳
  [1, 1, 0], // 손 ☴
  [0, 1, 0], // 감 ☵
  [1, 0, 0], // 간 ☶
  [0, 0, 0], // 곤 ☷
];

let sigilTex: Texture | null = null;

/**
 * 회전 발광 소환진: 이중 외곽 원 → 팔괘 8괘 → 눈금 링 → 내부 정사각/원 → 중심 문양.
 * Drawn white-on-transparent; the mesh tints and animates it.
 */
export function getSigilTexture(): Texture | null {
  if (!canBuild()) return null;
  if (sigilTex) return sigilTex;

  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const R = size * 0.47;

  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";

  const circle = (r: number, w: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  };

  // ── outer double ring ────────────────────────────────────────────
  circle(R, 5, 0.95);
  circle(R * 0.955, 2, 0.5);
  circle(R * 0.70, 2.5, 0.7);
  circle(R * 0.665, 1.2, 0.35);

  // ── 팔괘 (between the two ring pairs) ────────────────────────────
  const barLen = size * 0.086;
  const barGap = size * 0.0225;
  const barW = size * 0.0125;
  const half = barLen / 2;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = R * 0.83;
    ctx.save();
    ctx.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
    ctx.rotate(a + Math.PI / 2);
    ctx.globalAlpha = 0.92;
    const lines = TRIGRAMS[i];
    for (let l = 0; l < 3; l += 1) {
      const y = (l - 1) * (barW + barGap);
      if (lines[2 - l] === 1) {
        ctx.fillRect(-half, y - barW / 2, barLen, barW);
      } else {
        const seg = half * 0.62;
        ctx.fillRect(-half, y - barW / 2, seg, barW);
        ctx.fillRect(half - seg, y - barW / 2, seg, barW);
      }
    }
    ctx.restore();
  }

  // ── tick ring between 팔괘 and the inner circle ──────────────────
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 9 === 0;
    const r0 = R * 0.70;
    const r1 = r0 + (long ? size * 0.03 : size * 0.014);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }

  // ── inner rotated squares (전통 문양 모티프) ─────────────────────
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 3;
  for (const rot of [0, Math.PI / 4]) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rot);
    const s = R * 0.44;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();
  }

  circle(R * 0.44, 2.4, 0.75);
  circle(R * 0.2, 3, 0.9);

  // ── radial spokes from the centre outward ───────────────────────
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 0.2, c + Math.sin(a) * R * 0.2);
    ctx.lineTo(c + Math.cos(a) * R * 0.955, c + Math.sin(a) * R * 0.955);
    ctx.stroke();
  }

  // ── centre bloom so the sigil reads even at a glance ─────────────
  const grd = ctx.createRadialGradient(c, c, 0, c, c, R * 0.24);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.55, "rgba(255,255,255,0.22)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.24, 0, Math.PI * 2);
  ctx.fill();

  sigilTex = finish(canvas);
  return sigilTex;
}

/* ------------------------------------------------------------------ */
/* 바닥 혈흔 데칼 (토글 대상, SCENES.md 4절)                             */
/* ------------------------------------------------------------------ */

const decalCache = new Map<number, Texture>();

/**
 * Irregular splatter: one warped central blob + satellite droplets.
 * 15금 가드 — 파티클/얼룩까지만, 인체 묘사 없음 (PRD 2절).
 */
export function getBloodDecalTexture(seed: number): Texture | null {
  if (!canBuild()) return null;
  const cached = decalCache.get(seed);
  if (cached) return cached;

  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const rnd = mulberry32(seed * 7919 + 13);
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";

  // central blob — polar radius modulated by a couple of harmonics
  const baseR = size * 0.2;
  const h1 = 0.22 + rnd() * 0.2;
  const h2 = 0.1 + rnd() * 0.16;
  const p1 = rnd() * Math.PI * 2;
  const p2 = rnd() * Math.PI * 2;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  for (let i = 0; i <= 96; i += 1) {
    const a = (i / 96) * Math.PI * 2;
    const r =
      baseR * (1 + h1 * Math.sin(a * 3 + p1) + h2 * Math.sin(a * 5 + p2));
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r * 0.86;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // drips + satellites
  for (let i = 0; i < 22; i += 1) {
    const a = rnd() * Math.PI * 2;
    const d = baseR * (1.05 + rnd() * 1.5);
    const r = size * (0.006 + rnd() * 0.026);
    ctx.globalAlpha = 0.35 + rnd() * 0.5;
    ctx.beginPath();
    ctx.ellipse(
      c + Math.cos(a) * d,
      c + Math.sin(a) * d * 0.9,
      r,
      r * (0.6 + rnd() * 0.7),
      a,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // soften the rim so it beds into the wood
  const soft = ctx.createRadialGradient(c, c, size * 0.28, c, c, size * 0.5);
  soft.addColorStop(0, "rgba(0,0,0,0)");
  soft.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  const tex = finish(canvas);
  decalCache.set(seed, tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* 균열 (방사형 라인) — 타격 지점 바닥                                   */
/* ------------------------------------------------------------------ */

let crackTex: Texture | null = null;

/** Radial fracture lines with a hot core, used for the impact ground mark. */
export function getCrackTexture(): Texture | null {
  if (!canBuild()) return null;
  if (crackTex) return crackTex;

  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const rnd = mulberry32(4483);
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";

  const branch = (
    x: number,
    y: number,
    angle: number,
    len: number,
    width: number,
    depth: number,
  ) => {
    if (depth > 3 || len < 4) return;
    let cx = x;
    let cy = y;
    let a = angle;
    ctx.globalAlpha = 0.85 * (1 - depth * 0.22);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const steps = 5;
    for (let i = 0; i < steps; i += 1) {
      a += (rnd() - 0.5) * 0.55;
      cx += Math.cos(a) * (len / steps);
      cy += Math.sin(a) * (len / steps);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    if (rnd() < 0.75) {
      branch(cx, cy, a + (rnd() - 0.5) * 1.3, len * 0.55, width * 0.6, depth + 1);
    }
    if (rnd() < 0.4) {
      branch(cx, cy, a + (rnd() - 0.5) * 1.9, len * 0.4, width * 0.5, depth + 1);
    }
  };

  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.4;
    branch(c, c, a, size * 0.2, 4.2, 0);
  }

  const grd = ctx.createRadialGradient(c, c, 0, c, c, size * 0.16);
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.4, "rgba(255,255,255,0.3)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // fade the outer edge
  const soft = ctx.createRadialGradient(c, c, size * 0.3, c, c, size * 0.5);
  soft.addColorStop(0, "rgba(0,0,0,0)");
  soft.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  crackTex = finish(canvas);
  return crackTex;
}
