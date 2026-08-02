"use client";

/**
 * 타이틀 배경 전통 문양 (P6, docs/PRD.md 4절 "전통 문양 배경은 SVG 프로시저럴").
 *
 * CLAUDE.md 3절이 외부 이미지를 금지하므로 **모든 path 좌표를 코드로 생성**한다.
 * 모티프는 셋이고, 각각 게임 안의 무언가를 가리킨다:
 *
 *   · 격자   — 9×10 교차점 장기판과 궁성 대각선 (docs/RULES.md 1절)
 *   · 팔괘   — 외통 승리 연출이 전개하는 문양과 같은 소재 (SCENES.md 3절)
 *   · 구름   — 여의두 스타일 반원 스캘럽 + 소용돌이. 전통 단청의 서기(瑞氣)
 *
 * 배경이 로고를 이기면 안 되므로 중앙은 radial mask로 비우고, 전체 opacity는
 * 0.4 아래로 눌러 둔다. 진영색(초 녹청 / 한 적색)을 좌우로 갈라 배치해
 * "마주 앉은 두 진영"이 배경 자체로 읽히게 했다.
 */

const VW = 1600;
const VH = 900;

/* ------------------------------------------------------------------ */
/* 팔괘 — 三획 조합 8개를 원주에 배치                                    */
/* ------------------------------------------------------------------ */

/** 선천팔괘 순서. 각 원소는 위→아래 세 획, 1 = 양(이어짐) / 0 = 음(끊김). */
const TRIGRAMS = [0b111, 0b011, 0b101, 0b001, 0b000, 0b100, 0b010, 0b110];

const BAR_W = 82;
const BAR_H = 9;
const BAR_GAP = 18;
const YIN_GAP = 20;

/** 획 3개를 로컬 좌표(중심 원점)의 <rect> 목록으로 편다. */
function trigramBars(bits: number) {
  const bars: { x: number; y: number; w: number }[] = [];
  for (let row = 0; row < 3; row += 1) {
    const yang = (bits >> (2 - row)) & 1;
    const y = (row - 1) * (BAR_H + BAR_GAP) - BAR_H / 2;
    if (yang) {
      bars.push({ x: -BAR_W / 2, y, w: BAR_W });
    } else {
      const half = (BAR_W - YIN_GAP) / 2;
      bars.push({ x: -BAR_W / 2, y, w: half });
      bars.push({ x: YIN_GAP / 2, y, w: half });
    }
  }
  return bars;
}

function TrigramRing({ cx, cy, radius }: { cx: number; cy: number; radius: number }) {
  return (
    <g>
      {TRIGRAMS.map((bits, i) => {
        const deg = (360 / TRIGRAMS.length) * i - 90;
        const rad = (deg * Math.PI) / 180;
        const x = cx + Math.cos(rad) * radius;
        const y = cy + Math.sin(rad) * radius;
        return (
          <g
            key={bits * 10 + i}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(deg + 90).toFixed(1)})`}
          >
            {trigramBars(bits).map((b, j) => (
              <rect
                key={`${j}-${b.x}-${b.y}`}
                x={b.x}
                y={b.y}
                width={b.w}
                height={BAR_H}
                rx={2}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* 구름 — 반원 스캘럽 + 소용돌이 꼬리                                    */
/* ------------------------------------------------------------------ */

/** 반지름 r짜리 반원을 n번 이어 붙인 스캘럽 띠. */
function scallopPath(n: number, r: number): string {
  let d = "M 0 0";
  for (let i = 0; i < n; i += 1) d += ` a ${r} ${r} 0 0 1 ${r * 2} 0`;
  return d;
}

/** 아르키메데스 나선 — 여의두 구름의 말린 끝. */
function spiralPath(turns: number, r0: number, growth: number): string {
  const steps = Math.round(turns * 24);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * turns * Math.PI * 2;
    const r = r0 + growth * a;
    pts.push(`${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")}`;
}

function Cloud({
  x,
  y,
  scale,
  flip = false,
  bumps = 4,
}: {
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
  bumps?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <path d={scallopPath(bumps, 26)} />
      <path d={scallopPath(bumps - 1, 26)} transform="translate(26 26)" />
      <path d={spiralPath(1.6, 5, 4.2)} transform={`translate(${bumps * 52 + 16} 6)`} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* 장기판 격자 + 궁성                                                    */
/* ------------------------------------------------------------------ */

const CELL = 46;
const FILES = 9;
const RANKS = 10;

/** 9×10 교차점 판 하나. 궁성 X자까지 포함해 실제 장기판과 같은 도형이다. */
function BoardGlyph({ x, y, opacity }: { x: number; y: number; opacity: number }) {
  const w = (FILES - 1) * CELL;
  const h = (RANKS - 1) * CELL;
  const palaceTop = (r: number) => r * CELL;
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      {Array.from({ length: FILES }, (_, i) => (
        <line key={`f${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={h} />
      ))}
      {Array.from({ length: RANKS }, (_, i) => (
        <line key={`r${i}`} x1={0} y1={i * CELL} x2={w} y2={i * CELL} />
      ))}
      {/* 궁성 대각선 — 초(아래) / 한(위) */}
      {[0, 7].map((r) => (
        <g key={`p${r}`}>
          <line
            x1={3 * CELL}
            y1={palaceTop(r)}
            x2={5 * CELL}
            y2={palaceTop(r + 2)}
          />
          <line
            x1={5 * CELL}
            y1={palaceTop(r)}
            x2={3 * CELL}
            y2={palaceTop(r + 2)}
          />
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */

export function TraditionalPattern() {
  return (
    <svg
      aria-hidden
      data-testid="title-pattern"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <defs>
        {/* 중앙을 비우는 마스크 — 로고와 버튼이 문양 위에서 읽히도록 */}
        <radialGradient id="jg-center-clear" cx="50%" cy="46%" r="52%">
          <stop offset="0%" stopColor="#000" />
          <stop offset="52%" stopColor="#333" />
          <stop offset="100%" stopColor="#fff" />
        </radialGradient>
        <mask id="jg-mask">
          <rect width={VW} height={VH} fill="url(#jg-center-clear)" />
        </mask>
        {/* 진영색: 왼쪽 초(녹청) → 오른쪽 한(적색) */}
        <linearGradient id="jg-faction" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1cbea0" />
          <stop offset="45%" stopColor="#8f7a52" />
          <stop offset="100%" stopColor="#e04a36" />
        </linearGradient>
      </defs>

      <g mask="url(#jg-mask)">
        {/* 격자 — 좌우 두 판이 마주 본다 */}
        <g stroke="url(#jg-faction)" strokeWidth={1.2} fill="none">
          <BoardGlyph x={-150} y={54} opacity={0.85} />
          <BoardGlyph x={1266} y={432} opacity={0.85} />
        </g>

        {/*
          팔괘 — 반지름 520. 위·아래 괘가 화면 밖으로 나가 로고와 하단 문구를
          비켜 가고, 나머지 여섯이 좌우 여백에만 남는다 (r=392로 두면 로고
          양옆과 하단 문구 위에 정확히 얹힌다 — 1차 스크린샷에서 확인).
        */}
        <g fill="url(#jg-faction)" stroke="none" opacity={0.5}>
          <TrigramRing cx={VW / 2} cy={VH / 2} radius={520} />
        </g>
        <g stroke="url(#jg-faction)" fill="none" opacity={0.22}>
          <circle cx={VW / 2} cy={VH / 2} r={430} strokeWidth={1} />
          <circle cx={VW / 2} cy={VH / 2} r={612} strokeWidth={1} />
        </g>

        {/* 구름 — 아래·위 대각으로 흐르게 (배경이므로 선을 얇고 옅게) */}
        <g stroke="url(#jg-faction)" fill="none" strokeWidth={1.8} opacity={0.34}>
          <Cloud x={40} y={756} scale={1.2} bumps={4} />
          <Cloud x={1560} y={150} scale={1.2} bumps={4} flip />
          <Cloud x={252} y={92} scale={0.66} bumps={3} />
          <Cloud x={1348} y={812} scale={0.66} bumps={3} flip />
        </g>
      </g>
    </svg>
  );
}

export default TraditionalPattern;
