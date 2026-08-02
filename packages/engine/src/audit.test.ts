/**
 * audit.test.ts — 적대적 룰 감사 (독립 QA 에이전트)
 *
 * 원칙:
 *  - 기대값은 전부 docs/RULES.md 조항에서 직접 유도했다. 구현(movegen.ts / game.ts)의 코드를
 *    베끼지 않는다. 하단의 레퍼런스 구현도 RULES.md 1·3절 문장만 보고 독립 작성한 것이다.
 *  - 기존 103개 테스트가 다루지 않는 국면·조합만 담는다.
 *  - 좌표 규약: RULES.md 1절 (파일 a~i = 0~8, 랭크 1~10 = 0~9, 초가 아래).
 */
import { describe, expect, it } from "vitest";
import {
  EngineError,
  allLegalActions,
  applyAction,
  emptyBoard,
  findGeneral,
  initialState,
  isCheck,
  isCheckmate,
  isFacing,
  isLegal,
  legalMovesFrom,
  parseNotation,
  perft,
  positionKey,
  pseudoLegalMovesFrom,
  stateFrom,
  toNotation,
} from "./index.js";
import type { Action, Board, GameState, Piece, PieceType, Side, Square } from "./index.js";
import { legal, move, pass, pos, sq } from "./test-helpers.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* =====================================================================================
 * 독립 레퍼런스 구현 — docs/RULES.md 1절·3절 문장에서 직접 유도 (구현 코드 미참조)
 * ===================================================================================*/

interface RS {
  f: number;
  r: number;
}
const REF_FILES = "abcdefghi";
const rparse = (n: string): RS => ({ f: REF_FILES.indexOf(n[0]!), r: Number(n.slice(1)) - 1 });
const rnot = (s: RS): string => `${REF_FILES[s.f]}${s.r + 1}`;
/** RULES.md 1절: 교차점 9줄(파일) x 10칸(랭크) */
const rOn = (s: RS): boolean => s.f >= 0 && s.f <= 8 && s.r >= 0 && s.r <= 9;

interface RRect {
  f0: number;
  f1: number;
  r0: number;
  r1: number;
}
/** RULES.md 1절: 궁성 초 = d1~f3, 한 = d8~f10 */
const CHO_PAL: RRect = { f0: 3, f1: 5, r0: 0, r1: 2 };
const HAN_PAL: RRect = { f0: 3, f1: 5, r0: 7, r1: 9 };
const inRect = (s: RS, p: RRect): boolean => s.f >= p.f0 && s.f <= p.f1 && s.r >= p.r0 && s.r <= p.r1;
const palOf = (side: Side): RRect => (side === "cho" ? CHO_PAL : HAN_PAL);

/**
 * RULES.md 1절: "초 궁성의 대각 연결점 = d1-e2-f3, f1-e2-d3. 한 궁성 동형(d8-e9-f10, f8-e9-d10)"
 * 대각선이 있는 지점에서만 대각 이동이 가능하다 → 아래 8개 간선이 전부다.
 */
const REF_DIAG_EDGES: Array<[string, string]> = [
  ["d1", "e2"],
  ["e2", "f3"],
  ["f1", "e2"],
  ["e2", "d3"],
  ["d8", "e9"],
  ["e9", "f10"],
  ["f8", "e9"],
  ["e9", "d10"],
];
const REF_DIAG_ADJ = new Map<string, RS[]>();
for (const [a, b] of REF_DIAG_EDGES) {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as Array<[string, string]>) {
    if (!REF_DIAG_ADJ.has(x)) REF_DIAG_ADJ.set(x, []);
    REF_DIAG_ADJ.get(x)!.push(rparse(y));
  }
}
const refDiagNeighbors = (s: RS): RS[] => (rOn(s) ? (REF_DIAG_ADJ.get(rnot(s)) ?? []) : []);
const refDiagStep = (s: RS, df: number, dr: number): RS | null =>
  refDiagNeighbors(s).find((n) => n.f - s.f === df && n.r - s.r === dr) ?? null;

const REF_ORTHO: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const REF_DIAG: Array<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const refAt = (board: Board, s: RS): Piece | null => (rOn(s) ? (board[s.r]![s.f] ?? null) : null);

/** RULES.md 3절 전체를 문장 그대로 옮긴 의사합법 수 생성기. */
function refMoves(board: Board, from: RS, piece: Piece): RS[] {
  const out: RS[] = [];
  const takeable = (s: RS): void => {
    if (!rOn(s)) return;
    const t = refAt(board, s);
    if (!t || t.side !== piece.side) out.push(s);
  };

  switch (piece.type) {
    /* 3.1 차: 가로·세로 임의 거리 + 궁성 대각선 위에서는 대각선을 따라 직선 이동 */
    case "chariot": {
      for (const [df, dr] of REF_ORTHO) {
        let cur: RS = { f: from.f + df, r: from.r + dr };
        while (rOn(cur)) {
          const t = refAt(board, cur);
          if (!t) out.push(cur);
          else {
            if (t.side !== piece.side) out.push(cur);
            break;
          }
          cur = { f: cur.f + df, r: cur.r + dr };
        }
      }
      for (const [df, dr] of REF_DIAG) {
        let cur: RS = from;
        for (;;) {
          const nxt = refDiagStep(cur, df, dr);
          if (!nxt) break;
          const t = refAt(board, nxt);
          if (!t) {
            out.push(nxt);
            cur = nxt;
            continue;
          }
          if (t.side !== piece.side) out.push(nxt);
          break;
        }
      }
      return out;
    }

    /* 3.2 포: 정확히 1개의 포다리를 넘는다. 포다리가 포면 불가, 포는 포를 못 잡는다 */
    case "cannon": {
      const runScreen = (line: RS[]): void => {
        let i = 0;
        while (i < line.length && !refAt(board, line[i]!)) i++;
        if (i >= line.length) return; // 포다리 없음
        if (refAt(board, line[i]!)!.type === "cannon") return; // 포는 포를 넘지 못한다
        for (let j = i + 1; j < line.length; j++) {
          const t = refAt(board, line[j]!);
          if (!t) {
            out.push(line[j]!);
            continue;
          }
          if (t.side !== piece.side && t.type !== "cannon") out.push(line[j]!); // 포는 포를 못 잡는다
          break;
        }
      };
      for (const [df, dr] of REF_ORTHO) {
        const line: RS[] = [];
        let cur: RS = { f: from.f + df, r: from.r + dr };
        while (rOn(cur)) {
          line.push(cur);
          cur = { f: cur.f + df, r: cur.r + dr };
        }
        runScreen(line);
      }
      for (const [df, dr] of REF_DIAG) {
        const line: RS[] = [];
        let cur: RS = from;
        for (;;) {
          const nxt = refDiagStep(cur, df, dr);
          if (!nxt) break;
          line.push(nxt);
          cur = nxt;
        }
        runScreen(line);
      }
      return out;
    }

    /* 3.3 마: 직선 1칸 + 그 방향 바깥 대각 1칸. 직선 1칸 지점이 막히면(멱) 불가 */
    case "horse": {
      for (const [df, dr] of REF_ORTHO) {
        const leg: RS = { f: from.f + df, r: from.r + dr };
        if (!rOn(leg) || refAt(board, leg)) continue;
        const outward: Array<[number, number]> =
          df !== 0
            ? [
                [df, 1],
                [df, -1],
              ]
            : [
                [1, dr],
                [-1, dr],
              ];
        for (const [ddf, ddr] of outward) takeable({ f: leg.f + ddf, r: leg.r + ddr });
      }
      return out;
    }

    /* 3.4 상: 직선 1칸 + 같은 방향 대각 2칸. 멱 2곳(직선 1칸 지점, 첫 대각 1칸 지점) */
    case "elephant": {
      for (const [df, dr] of REF_ORTHO) {
        const leg: RS = { f: from.f + df, r: from.r + dr };
        if (!rOn(leg) || refAt(board, leg)) continue; // 멱 1
        const outward: Array<[number, number]> =
          df !== 0
            ? [
                [df, 1],
                [df, -1],
              ]
            : [
                [1, dr],
                [-1, dr],
              ];
        for (const [ddf, ddr] of outward) {
          const mid: RS = { f: leg.f + ddf, r: leg.r + ddr };
          if (!rOn(mid) || refAt(board, mid)) continue; // 멱 2
          takeable({ f: mid.f + ddf, r: mid.r + ddr });
        }
      }
      return out;
    }

    /* 3.5 졸/병: 앞 1칸 또는 옆 1칸, 후퇴 불가. 상대 궁성 대각선 위에서는 전진 대각 1칸 */
    case "soldier": {
      const fwd = piece.side === "cho" ? 1 : -1;
      takeable({ f: from.f, r: from.r + fwd });
      takeable({ f: from.f - 1, r: from.r });
      takeable({ f: from.f + 1, r: from.r });
      const enemyPal = piece.side === "cho" ? HAN_PAL : CHO_PAL;
      if (inRect(from, enemyPal)) {
        for (const n of refDiagNeighbors(from)) if (n.r - from.r === fwd) takeable(n);
      }
      return out;
    }

    /* 3.6 / 3.7 사·궁: 궁성 밖 불가, 궁성 내 선(가로·세로·해당 지점의 대각)을 따라 1칸 */
    case "guard":
    case "general": {
      const pal = palOf(piece.side);
      for (const [df, dr] of REF_ORTHO) {
        const s: RS = { f: from.f + df, r: from.r + dr };
        if (inRect(s, pal)) takeable(s);
      }
      for (const n of refDiagNeighbors(from)) if (inRect(n, pal)) takeable(n);
      return out;
    }
  }
}

function refAllMoves(board: Board, side: Side): Array<{ from: RS; to: RS }> {
  const out: Array<{ from: RS; to: RS }> = [];
  for (let r = 0; r <= 9; r++) {
    for (let f = 0; f <= 8; f++) {
      const p = board[r]![f];
      if (!p || p.side !== side) continue;
      for (const to of refMoves(board, { f, r }, p)) out.push({ from: { f, r }, to });
    }
  }
  return out;
}

/** RULES.md 4절: 장군 = 다음 수에 궁이 잡힐 수 있는 상태 */
function refIsCheck(board: Board, side: Side): boolean {
  let g: RS | null = null;
  for (let r = 0; r <= 9 && !g; r++)
    for (let f = 0; f <= 8 && !g; f++) {
      const p = board[r]![f];
      if (p && p.side === side && p.type === "general") g = { f, r };
    }
  if (!g) return false;
  return refAllMoves(board, side === "cho" ? "han" : "cho").some((m) => m.to.f === g!.f && m.to.r === g!.r);
}

function refApply(board: Board, from: RS, to: RS): Board {
  const next = board.map((row) => row.slice());
  next[to.r]![to.f] = next[from.r]![from.f]!;
  next[from.r]![from.f] = null;
  return next;
}

/** RULES.md 4절 자살수 금지 필터를 적용한 합법 도착점 */
function refLegalFrom(board: Board, from: RS, piece: Piece): string[] {
  return refMoves(board, from, piece)
    .filter((to) => !refIsCheck(refApply(board, from, to), piece.side))
    .map(rnot)
    .sort();
}

const implMoves = (board: Board, n: string): string[] =>
  pseudoLegalMovesFrom(board, parseNotation(n)).map(toNotation).sort();

/** RULES.md 4절: 두 궁이 같은 파일에서 사이에 기물 없이 마주 보는 상태 */
function refFacing(board: Board): boolean {
  let c: RS | null = null;
  let h: RS | null = null;
  for (let r = 0; r <= 9; r++)
    for (let f = 0; f <= 8; f++) {
      const p = board[r]![f];
      if (p && p.type === "general") {
        if (p.side === "cho") c = { f, r };
        else h = { f, r };
      }
    }
  if (!c || !h || c.f !== h.f) return false;
  const lo = Math.min(c.r, h.r);
  const hi = Math.max(c.r, h.r);
  for (let r = lo + 1; r < hi; r++) if (board[r]![c.f]) return false;
  return true;
}

type RAction = { kind: "pass" } | { kind: "move"; from: RS; to: RS };
const refOther = (s: Side): Side => (s === "cho" ? "han" : "cho");

/** RULES.md 4절: 자살수 금지 + 한수쉼(장군 상태에서는 불가) */
function refLegalActions(board: Board, turn: Side): RAction[] {
  const out: RAction[] = [];
  for (const m of refAllMoves(board, turn))
    if (!refIsCheck(refApply(board, m.from, m.to), turn)) out.push({ kind: "move", from: m.from, to: m.to });
  if (!refIsCheck(board, turn)) out.push({ kind: "pass" });
  return out;
}

/** 정확히 depth 플라이의 합법 수순 개수. 종료 국면(외통·빅장)은 이후 수순 0. */
function refPerft(board: Board, turn: Side, depth: number): number {
  if (depth <= 0) return 1;
  const actions = refLegalActions(board, turn);
  if (depth === 1) return actions.length;
  let total = 0;
  for (const a of actions) {
    const nb = a.kind === "pass" ? board : refApply(board, a.from, a.to);
    const nt = refOther(turn);
    const mate = refIsCheck(nb, nt) && refLegalActions(nb, nt).length === 0;
    if (mate || refFacing(nb)) continue; // RULES.md 4절: 여기서 대국이 끝난다
    total += refPerft(nb, nt, depth - 1);
  }
  return total;
}
const refKey = (a: RAction): string => (a.kind === "pass" ? "pass" : `${rnot(a.from)}${rnot(a.to)}`);

/* ------------------------------------------------------------------ 잡다 헬퍼 */

const notes = (dests: Square[]): string[] => dests.map(toNotation).sort();
const actionKeys = (s: GameState): string[] =>
  allLegalActions(s)
    .map((a) => (a.kind === "pass" ? "pass" : `${toNotation(a.move.from)}${toNotation(a.move.to)}`))
    .sort();

function deepFreezeState(s: GameState): GameState {
  for (const row of s.board) {
    for (const p of row) if (p) Object.freeze(p);
    Object.freeze(row);
  }
  Object.freeze(s.board);
  Object.freeze(s.history);
  return Object.freeze(s);
}

function snapshot(s: GameState): string {
  return JSON.stringify({
    board: s.board,
    turn: s.turn,
    result: s.result,
    history: s.history,
    counts: [...s.positionCounts.entries()].sort(),
  });
}

/* =====================================================================================
 * A. 포 — 궁성 대각선 (RULES.md 3.2 마지막 줄)
 * ===================================================================================*/

describe("[감사 A] 포 궁성 대각 — RULES.md 3.2", () => {
  // 초 궁을 e3(대각선 없는 지점)에 두어 d1 포의 직선 사선을 전부 죽인 국면.
  const base = (extra: Record<string, [Side, PieceType]>) =>
    pos({ d1: ["cho", "cannon"], e3: ["cho", "general"], e9: ["han", "general"], ...extra }, "cho");

  it("A1: d1 포 + e2 포다리(사) → f3 이동 가능, 그 외 수는 없다", () => {
    expect(legal(base({ e2: ["cho", "guard"] }), "d1")).toEqual(["f3"]);
  });

  it("A2: 포다리가 아군 포이면 대각 불가 (포는 포를 넘을 수 없다)", () => {
    expect(legal(base({ e2: ["cho", "cannon"] }), "d1")).toEqual([]);
  });

  it("A3: 포다리가 적군 포여도 대각 불가", () => {
    expect(legal(base({ e2: ["han", "cannon"] }), "d1")).toEqual([]);
  });

  it("A4: 대각 도착점이 적 포이면 포획 불가 (포는 포를 잡을 수 없다)", () => {
    expect(legal(base({ e2: ["han", "soldier"], f3: ["han", "cannon"] }), "d1")).toEqual([]);
  });

  it("A5: 대각 도착점이 아군이면 불가", () => {
    expect(legal(base({ e2: ["han", "soldier"], f3: ["cho", "guard"] }), "d1")).toEqual([]);
  });

  it("A6: 대각 도착점이 적 일반 기물이면 포획 가능", () => {
    expect(legal(base({ e2: ["han", "soldier"], f3: ["han", "horse"] }), "d1")).toEqual(["f3"]);
  });

  it("A7: 중앙 e2가 비면 대각 불가 (포다리 없이 한 칸도 못 움직인다)", () => {
    expect(legal(base({ f3: ["han", "horse"] }), "d1")).toEqual([]);
  });

  it("A8: d2는 대각선이 없는 지점이라 e1/e3/c1/c3 어디로도 대각 진입 불가", () => {
    const s = pos(
      { d2: ["cho", "cannon"], e2: ["cho", "guard"], e3: ["cho", "general"], e9: ["han", "general"] },
      "cho",
    );
    const dests = legal(s, "d2");
    for (const n of ["c1", "c3", "e1", "e3", "f3"]) expect(dests).not.toContain(n);
  });

  it("A9: e1도 대각선 없는 지점 — d2/f2로 갈 수 없다", () => {
    const s = pos(
      { e1: ["cho", "cannon"], e2: ["cho", "guard"], d1: ["cho", "general"], e9: ["han", "general"] },
      "cho",
    );
    const dests = legal(s, "e1");
    expect(dests).not.toContain("d2");
    expect(dests).not.toContain("f2");
    expect(dests).toContain("e3"); // 세로 포다리(e2)는 정상 동작
  });

  it("A10: 한 궁성 동형 — d8 포 + e9 포다리 → f10 (그리고 f8→e9→d10)", () => {
    const a = pos({ d8: ["cho", "cannon"], e9: ["han", "general"], e2: ["cho", "general"] }, "cho");
    expect(legal(a, "d8")).toEqual(["f10"]);
    const b = pos({ f8: ["cho", "cannon"], e9: ["han", "general"], e2: ["cho", "general"] }, "cho");
    expect(legal(b, "f8")).toEqual(["d10"]);
  });

  it("A11: 한 궁성 위쪽 모서리에서 아래쪽 모서리로도 쏜다 (d10→e9→f8, f10→e9→d8)", () => {
    const a = pos({ d10: ["cho", "cannon"], e9: ["han", "general"], e2: ["cho", "general"] }, "cho");
    expect(legal(a, "d10")).toEqual(["f8"]);
    const b = pos({ f10: ["cho", "cannon"], e9: ["han", "general"], e2: ["cho", "general"] }, "cho");
    expect(legal(b, "f10")).toEqual(["d8"]);
  });
});

/* =====================================================================================
 * B. 차 — 궁성 대각선 (RULES.md 3.1)
 * ===================================================================================*/

describe("[감사 B] 차 궁성 대각 — RULES.md 3.1", () => {
  it("B1: d3 차는 d3→e2→f1을 관통한다", () => {
    const s = pos({ d3: ["cho", "chariot"], e1: ["cho", "general"], e9: ["han", "general"] }, "cho");
    const d = legal(s, "d3");
    expect(d).toContain("e2");
    expect(d).toContain("f1");
  });

  it("B2: 대각 경로의 적 기물은 포획하고 거기서 멈춘다 (f1까지 못 간다)", () => {
    const s = pos(
      { d3: ["cho", "chariot"], e2: ["han", "soldier"], e3: ["cho", "general"], e9: ["han", "general"] },
      "cho",
    );
    const d = legal(s, "d3");
    expect(d).toContain("e2");
    expect(d).not.toContain("f1");
  });

  it("B3: 대각 경로의 아군 기물은 e2·f1 둘 다 막는다", () => {
    const s = pos(
      { d3: ["cho", "chariot"], e2: ["cho", "soldier"], e1: ["cho", "general"], e9: ["han", "general"] },
      "cho",
    );
    const d = legal(s, "d3");
    expect(d).not.toContain("e2");
    expect(d).not.toContain("f1");
  });

  it("B4: 역방향도 동일 — f1→e2→d3", () => {
    const s = pos({ f1: ["cho", "chariot"], e1: ["cho", "general"], e9: ["han", "general"] }, "cho");
    const d = legal(s, "f1");
    expect(d).toContain("e2");
    expect(d).toContain("d3");
  });

  it("B5: 한 궁성 중앙 e9의 차는 네 모서리 전부로 나간다", () => {
    const s = pos({ e9: ["cho", "chariot"], e2: ["cho", "general"], e10: ["han", "general"] }, "cho");
    const d = legal(s, "e9");
    for (const n of ["d8", "f8", "d10", "f10"]) expect(d).toContain(n);
  });

  it("B6: e1은 대각선이 없는 지점 — d2/f2 도착 불가", () => {
    const s = pos({ e1: ["cho", "chariot"], e3: ["cho", "general"], e9: ["han", "general"] }, "cho");
    const d = legal(s, "e1");
    expect(d).not.toContain("d2");
    expect(d).not.toContain("f2");
  });

  it("B7: 궁성 밖(e4)에서는 대각으로 궁성에 진입할 수 없다", () => {
    const s = pos({ e4: ["cho", "chariot"], e2: ["cho", "general"], e9: ["han", "general"] }, "cho");
    const d = legal(s, "e4");
    expect(d).not.toContain("d3");
    expect(d).not.toContain("f3");
    expect(d).toContain("e3"); // 세로는 정상
  });

  it("B8: 궁성 옆(c2)에서도 대각 진입 불가", () => {
    const s = pos({ c2: ["cho", "chariot"], e2: ["cho", "general"], e9: ["han", "general"] }, "cho");
    const d = legal(s, "c2");
    expect(d).not.toContain("d1");
    expect(d).not.toContain("d3");
  });

  it("B9: 한 궁성 대각도 관통한다 (d10→e9→f8, f10→e9→d8)", () => {
    const a = pos({ d10: ["cho", "chariot"], e2: ["cho", "general"], d8: ["han", "general"] }, "cho");
    expect(legal(a, "d10")).toContain("e9");
    expect(legal(a, "d10")).toContain("f8");
    const b = pos({ f10: ["cho", "chariot"], e2: ["cho", "general"], e10: ["han", "general"] }, "cho");
    expect(legal(b, "f10")).toContain("e9");
    expect(legal(b, "f10")).toContain("d8");
  });
});

/* =====================================================================================
 * C. 포 — 일반 규칙 (RULES.md 3.2)
 * ===================================================================================*/

describe("[감사 C] 포 일반 — RULES.md 3.2", () => {
  it("C1: 포다리 2개면 두 번째 기물 너머로 못 간다", () => {
    const s = pos({ a1: ["cho", "cannon"], a3: ["cho", "horse"], a5: ["han", "horse"] }, "cho");
    expect(legal(s, "a1")).toEqual(["a4", "a5"]);
  });

  it("C2: 포다리 0개면 그 방향 수 0개 (가로)", () => {
    const s = pos({ c6: ["cho", "cannon"] }, "cho");
    expect(legal(s, "c6")).toEqual([]);
  });

  it("C3: 아군 포다리 위를 넘어도 아군 도착점에는 못 내린다", () => {
    const s = pos(
      { c6: ["cho", "cannon"], e6: ["cho", "soldier"], f6: ["cho", "soldier"] },
      "cho",
    );
    expect(legal(s, "c6")).toEqual([]);
  });

  it("C4: 아군 포다리 너머 빈 칸은 되고 그 다음 아군은 안 된다", () => {
    const s = pos(
      { c6: ["cho", "cannon"], e6: ["cho", "soldier"], g6: ["cho", "soldier"] },
      "cho",
    );
    expect(legal(s, "c6")).toEqual(["f6"]);
  });

  it("C5: 가로로도 포는 포를 잡지 못한다 (앞의 빈 칸은 여전히 합법)", () => {
    const s = pos({ c6: ["cho", "cannon"], e6: ["han", "soldier"], g6: ["han", "cannon"] }, "cho");
    expect(legal(s, "c6")).toEqual(["f6"]);
  });

  it("C6: 포다리 뒤 첫 기물이 포면 그 너머의 잡을 수 있는 기물에도 못 간다", () => {
    const s = pos(
      {
        c6: ["cho", "cannon"],
        e6: ["han", "soldier"],
        f6: ["han", "cannon"],
        g6: ["han", "horse"],
      },
      "cho",
    );
    expect(legal(s, "c6")).toEqual([]);
  });

  it("C7: 보드 모서리 포는 보드 밖으로 새지 않는다", () => {
    const s = pos({ i10: ["cho", "cannon"], i8: ["han", "soldier"], g10: ["han", "soldier"] }, "cho");
    // 아래: i8 포다리 → i7..i1 빈 칸 전부 / 왼쪽: g10 포다리 → f10..a10
    expect(legal(s, "i10")).toEqual(
      ["a10", "b10", "c10", "d10", "e10", "f10", "i1", "i2", "i3", "i4", "i5", "i6", "i7"].sort(),
    );
  });
});

/* =====================================================================================
 * D. 마 · 상 — 멱 (RULES.md 3.3 / 3.4)
 * ===================================================================================*/

describe("[감사 D] 마·상 멱 — RULES.md 3.3 / 3.4", () => {
  const ELEPHANT_E5 = ["b3", "b7", "c2", "c8", "g2", "g8", "h3", "h7"]; // (±2,±3)/(±3,±2)

  const withoutOf = (all: string[], drop: string[]) => all.filter((n) => !drop.includes(n)).sort();

  it("D1: 상 e5 — 첫 대각 d7이 막히면 c8만 사라진다", () => {
    const s = pos({ e5: ["cho", "elephant"], d7: ["han", "soldier"] }, "cho");
    expect(legal(s, "e5")).toEqual(withoutOf(ELEPHANT_E5, ["c8"]));
  });

  it("D2: 상 e5 — 첫 대각 g6이 막히면 h7만 사라진다", () => {
    const s = pos({ e5: ["cho", "elephant"], g6: ["cho", "soldier"] }, "cho");
    expect(legal(s, "e5")).toEqual(withoutOf(ELEPHANT_E5, ["h7"]));
  });

  it("D3: 상 e5 — 첫 대각 g4가 막히면 h3만 사라진다", () => {
    const s = pos({ e5: ["cho", "elephant"], g4: ["han", "horse"] }, "cho");
    expect(legal(s, "e5")).toEqual(withoutOf(ELEPHANT_E5, ["h3"]));
  });

  it("D4: 상 e5 — 첫 대각 c4가 막히면 b3만 사라진다", () => {
    const s = pos({ e5: ["cho", "elephant"], c4: ["han", "horse"] }, "cho");
    expect(legal(s, "e5")).toEqual(withoutOf(ELEPHANT_E5, ["b3"]));
  });

  it("D5: 상 e5 — 직선 멱 e4가 막히면 아래 두 방향(c2·g2)이 함께 죽는다", () => {
    const s = pos({ e5: ["cho", "elephant"], e4: ["han", "soldier"] }, "cho");
    expect(legal(s, "e5")).toEqual(withoutOf(ELEPHANT_E5, ["c2", "g2"]));
  });

  it("D6: 상 e5 — 직선 멱 d5가 막히면 왼쪽 두 방향(b3·b7)이 함께 죽는다", () => {
    const s = pos({ e5: ["cho", "elephant"], d5: ["cho", "soldier"] }, "cho");
    expect(legal(s, "e5")).toEqual(withoutOf(ELEPHANT_E5, ["b3", "b7"]));
  });

  it("D7: 멱은 아군·적군을 구분하지 않는다 (같은 칸을 아군/적군으로 바꿔도 동일)", () => {
    const friend = pos({ e5: ["cho", "elephant"], f7: ["cho", "soldier"] }, "cho");
    const foe = pos({ e5: ["cho", "elephant"], f7: ["han", "soldier"] }, "cho");
    expect(legal(friend, "e5")).toEqual(legal(foe, "e5"));
    expect(legal(foe, "e5")).toEqual(withoutOf(ELEPHANT_E5, ["g8"]));
  });

  it("D8: 마 e5 — 멱 d5가 막히면 c4·c6 두 곳이 함께 죽는다", () => {
    const s = pos({ e5: ["cho", "horse"], d5: ["han", "soldier"] }, "cho");
    expect(legal(s, "e5")).toEqual(["d3", "d7", "f3", "f7", "g4", "g6"]);
  });

  it("D9: 마 i10 — 보드 모서리 클리핑으로 g9·h8 2곳", () => {
    const s = pos({ i10: ["cho", "horse"], e2: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "i10")).toEqual(["g9", "h8"]);
  });

  it("D10: 상 e1 — 모서리 클리핑으로 b3·c4·g4·h3 4곳 (경로 칸은 모두 비워 둔다)", () => {
    // e1 상의 경로: 북 e2→{d3,f3}→{c4,g4} / 동 f1→g2→h3 / 서 d1→c2→b3. 초 궁은 d2(경로 밖)에 둔다.
    const s = pos({ e1: ["cho", "elephant"], d2: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "e1")).toEqual(["b3", "c4", "g4", "h3"]);
  });

  it("D11: 그 상태에서 서쪽 멱 d1을 막으면 b3만 사라진다 (멱 규칙 확인)", () => {
    const s = pos(
      { e1: ["cho", "elephant"], d1: ["cho", "general"], e9: ["han", "general"] },
      "cho",
    );
    expect(legal(s, "e1")).toEqual(["c4", "g4", "h3"]);
  });
});

/* =====================================================================================
 * E. 졸 · 병 (RULES.md 3.5)
 * ===================================================================================*/

describe("[감사 E] 졸·병 — RULES.md 3.5", () => {
  it("E1: 초 졸 f8 → 전진 f9, 옆 e8/g8, 궁성 대각 전진 e9", () => {
    const s = pos({ f8: ["cho", "soldier"], e2: ["cho", "general"], e10: ["han", "general"] }, "cho");
    expect(legal(s, "f8")).toEqual(["e8", "e9", "f9", "g8"]);
  });

  it("E2: 초 졸 e9 → d10/f10 대각 전진 포함, d8/f8(후퇴 대각)은 불가", () => {
    const s = pos({ e9: ["cho", "soldier"], d1: ["cho", "general"], e8: ["han", "general"] }, "cho");
    expect(legal(s, "e9")).toEqual(["d10", "d9", "e10", "f10", "f9"]);
  });

  it("E3: 초 졸 e8은 궁성 안이지만 대각선 없는 지점 — 대각 이동 없음", () => {
    const s = pos({ e8: ["cho", "soldier"], e2: ["cho", "general"], e10: ["han", "general"] }, "cho");
    expect(legal(s, "e8")).toEqual(["d8", "e9", "f8"]);
  });

  it("E4: 한 병 e2 → 전진 e1, 옆 d2/f2, 대각 전진 d1/f1", () => {
    const s = pos({ e2: ["han", "soldier"], d3: ["cho", "general"], e9: ["han", "general"] }, "han");
    expect(legal(s, "e2")).toEqual(["d1", "d2", "e1", "f1", "f2"]);
  });

  it("E5: 한 병 f3 → 대각 전진 e2 포함", () => {
    const s = pos({ f3: ["han", "soldier"], d1: ["cho", "general"], e9: ["han", "general"] }, "han");
    expect(legal(s, "f3")).toEqual(["e2", "e3", "f2", "g3"]);
  });

  it("E6: 한 병 d1 — 마지막 랭크, 후퇴 대각(e2) 불가, 옆 이동만", () => {
    const s = pos({ d1: ["han", "soldier"], f2: ["cho", "general"], e9: ["han", "general"] }, "han");
    expect(legal(s, "d1")).toEqual(["c1", "e1"]);
  });

  it("E7: 초 졸이 자기 궁성(e2)에 있으면 대각 이동은 없다 (상대 궁성 한정)", () => {
    const s = pos({ e2: ["cho", "soldier"], d1: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "e2")).toEqual(["d2", "e3", "f2"]);
  });

  it("E8: 초 졸 d10 — 대각 후퇴(e9) 불가, 옆 이동만", () => {
    const s = pos({ d10: ["cho", "soldier"], e2: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "d10")).toEqual(["c10", "e10"]);
  });

  it("E9: 궁성 대각 전진으로 적 기물을 포획할 수 있고 아군은 막는다", () => {
    const foe = pos(
      { d8: ["cho", "soldier"], e9: ["han", "guard"], e2: ["cho", "general"], d10: ["han", "general"] },
      "cho",
    );
    expect(legal(foe, "d8")).toContain("e9");
    const friend = pos(
      { d8: ["cho", "soldier"], e9: ["cho", "guard"], e2: ["cho", "general"], d10: ["han", "general"] },
      "cho",
    );
    expect(legal(friend, "d8")).not.toContain("e9");
  });

  it("E10: 궁성 안에서도 옆 이동은 그대로 가능하다 (초 졸 e9 → d9/f9)", () => {
    const s = pos({ e9: ["cho", "soldier"], d1: ["cho", "general"], e8: ["han", "general"] }, "cho");
    expect(legal(s, "e9")).toContain("d9");
    expect(legal(s, "e9")).toContain("f9");
  });
});

/* =====================================================================================
 * F. 사 · 궁 (RULES.md 3.6 / 3.7)
 * ===================================================================================*/

describe("[감사 F] 사·궁 — RULES.md 3.6 / 3.7", () => {
  it("F1: 사 f2 — 대각선 없는 지점이라 e2/f1/f3 3곳", () => {
    const s = pos({ f2: ["cho", "guard"], e1: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "f2")).toEqual(["e2", "f1", "f3"]);
  });

  it("F2: 사 e1 — d2/f2로는 못 간다 (대각선 없음)", () => {
    const s = pos({ e1: ["cho", "guard"], e3: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "e1")).toEqual(["d1", "e2", "f1"]);
  });

  it("F3: 사 e3 — d2/f2로는 못 가고 궁성 밖 e4도 불가", () => {
    const s = pos({ e3: ["cho", "guard"], e1: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "e3")).toEqual(["d3", "e2", "f3"]);
  });

  it("F4: 사 d3(모서리) — 대각 e2 포함 3곳", () => {
    const s = pos({ d3: ["cho", "guard"], e1: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "d3")).toEqual(["d2", "e2", "e3"]);
  });

  it("F5: 한 사 e10 — 대각선 없는 지점", () => {
    const s = pos({ e10: ["han", "guard"], d8: ["han", "general"], e2: ["cho", "general"] }, "han");
    expect(legal(s, "e10")).toEqual(["d10", "e9", "f10"]);
  });

  it("F6: 한 궁 d8(모서리) — d9/e8 + 대각 e9", () => {
    const s = pos({ d8: ["han", "general"], e2: ["cho", "general"] }, "han");
    expect(legal(s, "d8")).toEqual(["d9", "e8", "e9"]);
  });

  it("F7: 초 궁 d1은 궁성을 벗어날 수 없다 (c1 불가)", () => {
    const s = pos({ d1: ["cho", "general"], e9: ["han", "general"] }, "cho");
    expect(legal(s, "d1")).toEqual(["d2", "e1", "e2"]);
  });
});

/* =====================================================================================
 * G. 장군 · 자살수 · 핀 · 디스커버드 (RULES.md 4절)
 * ===================================================================================*/

describe("[감사 G] 장군·자살수·핀 — RULES.md 4절", () => {
  it("G1: 핀된 차는 공격선 위에서 움직이는 것만 합법 (e3/e5/e6, 옆은 비합법)", () => {
    const s = pos(
      {
        e2: ["cho", "general"],
        e4: ["cho", "chariot"],
        e6: ["han", "chariot"],
        e9: ["han", "general"],
      },
      "cho",
    );
    expect(legal(s, "e4")).toEqual(["e3", "e5", "e6"]);
  });

  it("G2: 디스커버드 체크 — 아군 기물이 비켜서면 뒤의 차가 장군을 건다", () => {
    const s = pos(
      {
        e2: ["cho", "general"],
        e3: ["cho", "chariot"],
        e5: ["cho", "soldier"],
        e9: ["han", "general"],
      },
      "cho",
    );
    expect(isCheck(s, "han")).toBe(false);
    const next = applyAction(s, move("e5", "f5"));
    expect(isCheck(next, "han")).toBe(true);
    expect(next.history.at(-1)!.check).toBe(true);
  });

  it("G3: 적 포의 포다리가 되어주는 수는 자살수 (d4→e4 비합법)", () => {
    const s = pos(
      { e2: ["cho", "general"], d4: ["cho", "soldier"], e7: ["han", "cannon"], e9: ["han", "general"] },
      "cho",
    );
    expect(isCheck(s, "cho")).toBe(false); // 포다리가 없으므로 장군 아님
    const d = legal(s, "d4");
    expect(d).not.toContain("e4");
    expect(d).toContain("d5");
    expect(d).toContain("c4");
  });

  it("G4: 포다리 노릇을 하던 아군이 선에서 벗어나면 장군이 풀린다 (선 위 이동은 비합법)", () => {
    const s = pos(
      { e2: ["cho", "general"], e4: ["cho", "soldier"], e7: ["han", "cannon"], e9: ["han", "general"] },
      "cho",
    );
    expect(isCheck(s, "cho")).toBe(true);
    expect(legal(s, "e4")).toEqual(["d4", "f4"]); // e5는 여전히 포다리 → 자살수
  });

  it("G5: 포 장군은 포다리가 사라지면 즉시 해소된다", () => {
    const withScreen = pos(
      { e2: ["cho", "general"], e4: ["han", "soldier"], e7: ["han", "cannon"], e9: ["han", "general"] },
      "cho",
    );
    expect(isCheck(withScreen, "cho")).toBe(true);
    const withoutScreen = pos(
      { e2: ["cho", "general"], e7: ["han", "cannon"], e9: ["han", "general"] },
      "cho",
    );
    expect(isCheck(withoutScreen, "cho")).toBe(false);
  });

  it("G6: 궁은 포가 공격하는 칸으로 이동할 수 없다", () => {
    // 한 포 d7 + 포다리 d4 → d1 공격. 초 궁 e1은 d1으로 갈 수 없다.
    const s = pos(
      {
        e1: ["cho", "general"],
        d4: ["cho", "soldier"],
        d7: ["han", "cannon"],
        e9: ["han", "general"],
      },
      "cho",
    );
    expect(legal(s, "e1")).not.toContain("d1");
    expect(legal(s, "e1")).toContain("f1");
  });

  it("G7: 한도 동일 — 자기 기물이 초 포의 포다리가 되는 수는 비합법", () => {
    const s = pos(
      { e9: ["han", "general"], d7: ["han", "soldier"], e4: ["cho", "cannon"], e2: ["cho", "general"] },
      "han",
    );
    expect(isCheck(s, "han")).toBe(false);
    expect(legal(s, "d7")).not.toContain("e7");
  });

  it("G9: 포도 궁성 대각으로 장군을 건다 (f8 포 + e9 포다리 → d10 궁)", () => {
    const s = pos(
      { d10: ["han", "general"], e9: ["han", "guard"], f8: ["cho", "cannon"], e2: ["cho", "general"] },
      "han",
    );
    expect(isCheck(s, "han")).toBe(true);
    // 포다리(e9 사)가 빠지면 장군이 풀린다
    const gone = pos(
      { d10: ["han", "general"], f8: ["cho", "cannon"], e2: ["cho", "general"] },
      "han",
    );
    expect(isCheck(gone, "han")).toBe(false);
    // 포다리가 포이면 장군이 아니다
    const cannonScreen = pos(
      { d10: ["han", "general"], e9: ["han", "cannon"], f8: ["cho", "cannon"], e2: ["cho", "general"] },
      "han",
    );
    expect(isCheck(cannonScreen, "han")).toBe(false);
  });

  it("G8: 양수겸장(두 기물의 동시 장군)은 한 줄을 막아도 해소되지 않는다", () => {
    const s = pos(
      {
        e9: ["han", "general"],
        d8: ["han", "guard"],
        a9: ["cho", "chariot"],
        e1: ["cho", "chariot"],
        d1: ["cho", "general"],
      },
      "han",
    );
    expect(isCheck(s, "han")).toBe(true);
    expect(legal(s, "d8")).toEqual([]); // d9로 한 줄, e8로 다른 줄을 막아도 나머지 장군이 남는다
    expect(legal(s, "e9")).toEqual(["d10", "f8", "f10"].sort());
  });
});

/* =====================================================================================
 * H. 외통 · 한수쉼 (RULES.md 4절)
 * ===================================================================================*/

/**
 * 감사용 자작 외통: 한 궁 d10(도피처 d9/e10/e9 3곳뿐).
 *  - 초 상 f7 → d10 장군 (멱 f8·e9 모두 빈 칸)
 *  - 초 차 a9 → 9랭크로 d9·e9 봉쇄
 *  - 초 마 g9 → e10 봉쇄 (멱 f9 빈 칸)
 */
const MATE_SPEC: Record<string, [Side, PieceType]> = {
  d10: ["han", "general"],
  f7: ["cho", "elephant"],
  a9: ["cho", "chariot"],
  g9: ["cho", "horse"],
  e1: ["cho", "general"],
};

describe("[감사 H] 외통·한수쉼 — RULES.md 4절", () => {
  it("H1: 자작 외통 국면 — 장군 + 합법수 0, 패스는 도피 수로 포함되지 않는다", () => {
    const s = pos(MATE_SPEC, "han");
    expect(isCheck(s, "han")).toBe(true);
    expect(allLegalActions(s)).toEqual([]);
    expect(isCheckmate(s)).toBe(true);
    expect(isLegal(s, pass)).toBe(false);
    expect(() => applyAction(s, pass)).toThrow(EngineError);
  });

  it("H2: 같은 국면에서 마를 빼면 도피처 e10이 열려 외통이 아니다 (합법수 정확히 1개)", () => {
    const spec = { ...MATE_SPEC };
    delete (spec as Record<string, unknown>)["g9"];
    const s = pos(spec, "han");
    expect(isCheck(s, "han")).toBe(true);
    expect(isCheckmate(s)).toBe(false);
    expect(actionKeys(s)).toEqual(["d10e10"]);
  });

  it("H3: 장군이 아닌데 이동 수가 0개면 유일한 합법 액션은 패스뿐 (스테일메이트 없음)", () => {
    const spec = { ...MATE_SPEC };
    delete (spec as Record<string, unknown>)["f7"]; // 장군만 제거 → d10은 공격받지 않음
    const s = pos(spec, "han");
    expect(isCheck(s, "han")).toBe(false);
    expect(actionKeys(s)).toEqual(["pass"]);
    const next = applyAction(s, pass);
    expect(next.result).toBeNull();
    expect(next.turn).toBe("cho");
  });

  it("H4: 외통을 만드는 수를 두면 result=checkmate/공격측", () => {
    // 상을 h5에 두고 h5→f8? 대신 f7로 오는 수를 만든다: 상 d4 → f7
    const s = pos(
      { d10: ["han", "general"], d4: ["cho", "elephant"], a9: ["cho", "chariot"], g9: ["cho", "horse"], e1: ["cho", "general"] },
      "cho",
    );
    expect(isCheck(s, "han")).toBe(false);
    const next = applyAction(s, move("d4", "f7"));
    expect(next.result).toEqual({ type: "checkmate", winner: "cho" });
    expect(next.history.at(-1)!.check).toBe(true);
  });

  it("H5: 외통 이후에는 어떤 액션도 throw", () => {
    const s = pos(
      { d10: ["han", "general"], d4: ["cho", "elephant"], a9: ["cho", "chariot"], g9: ["cho", "horse"], e1: ["cho", "general"] },
      "cho",
    );
    const done = applyAction(s, move("d4", "f7"));
    expect(() => applyAction(done, pass)).toThrow(EngineError);
    expect(() => applyAction(done, move("d10", "e10"))).toThrow(EngineError);
    expect(allLegalActions(done)).toEqual([]);
    expect(legalMovesFrom(done, sq("d10"))).toEqual([]);
  });
});

/* =====================================================================================
 * I. 빅장 · 반복 (RULES.md 4절)
 * ===================================================================================*/

describe("[감사 I] 빅장·반복 — RULES.md 4절", () => {
  it("I1: 빅장을 만드는 수는 합법이며 즉시 draw/facing", () => {
    const s = pos({ e2: ["cho", "general"], e5: ["cho", "horse"], e9: ["han", "general"] }, "cho");
    expect(isFacing(s.board)).toBe(false);
    expect(notes(legalMovesFrom(s, sq("e5")))).toContain("d7");
    expect(isLegal(s, move("e5", "d7"))).toBe(true);
    const next = applyAction(s, move("e5", "d7"));
    expect(isFacing(next.board)).toBe(true);
    expect(next.result).toEqual({ type: "draw", reason: "facing" });
  });

  it("I2: 사이에 기물이 1개라도 있으면 빅장이 아니다", () => {
    const s = pos({ e2: ["cho", "general"], e5: ["han", "soldier"], e9: ["han", "general"] }, "cho");
    expect(isFacing(s.board)).toBe(false);
    // 초가 관계없는 수를 둬도 무승부가 아니다
    const with2 = pos(
      { e2: ["cho", "general"], e5: ["han", "soldier"], e9: ["han", "general"], a1: ["cho", "chariot"] },
      "cho",
    );
    expect(applyAction(with2, move("a1", "a2")).result).toBeNull();
  });

  it("I3: 두 궁이 다른 파일이면 사이가 비어도 빅장이 아니다", () => {
    const s = pos({ d1: ["cho", "general"], e9: ["han", "general"], a1: ["cho", "chariot"] }, "cho");
    expect(isFacing(s.board)).toBe(false);
    expect(applyAction(s, move("a1", "a2")).result).toBeNull();
  });

  it("I4: 궁이 스스로 파일을 맞춰도 빅장 — 즉시 draw/facing", () => {
    const s = pos({ e2: ["cho", "general"], d10: ["han", "general"] }, "cho");
    expect(notes(legalMovesFrom(s, sq("e2")))).toContain("d2");
    const next = applyAction(s, move("e2", "d2"));
    expect(next.result).toEqual({ type: "draw", reason: "facing" });
  });

  it("I5: 패스와 이동이 섞인 반복도 3회째에 draw/repetition", () => {
    // 두 궁을 다른 파일에 두어 빅장이 먼저 발동하지 않게 한다
    let s = pos({ e2: ["cho", "general"], d10: ["han", "general"], i10: ["han", "chariot"] }, "cho");
    const seq: Action[] = [
      pass,
      move("i10", "i9"),
      pass,
      move("i9", "i10"),
      pass,
      move("i10", "i9"),
      pass,
      move("i9", "i10"),
    ];
    for (let i = 0; i < seq.length; i++) {
      expect(s.result, `ply ${i} 이전에 끝나면 안 된다`).toBeNull();
      s = applyAction(s, seq[i]!);
    }
    expect(s.result).toEqual({ type: "draw", reason: "repetition" });
  });

  it("I6: 외통과 빅장이 동시에 성립하면 외통이 우선 (DECISIONS 6번 해석)", () => {
    // 초 궁 d1 / 한 궁 d10, d파일을 막고 있던 초 상 d4가 f7로 나가며 외통 + 빅장 동시 성립
    const s = pos(
      {
        d1: ["cho", "general"],
        d4: ["cho", "elephant"],
        a9: ["cho", "chariot"],
        g9: ["cho", "horse"],
        d10: ["han", "general"],
      },
      "cho",
    );
    expect(isFacing(s.board)).toBe(false);
    expect(isCheck(s, "han")).toBe(false);
    const next = applyAction(s, move("d4", "f7"));
    expect(isFacing(next.board)).toBe(true); // 빅장도 실제로 성립한다
    expect(isCheck(next, "han")).toBe(true);
    expect(next.result).toEqual({ type: "checkmate", winner: "cho" });
  });

  it("I7: 반복 판정은 배치+차례가 모두 같아야 한다 (같은 배치라도 차례가 다르면 별개 국면)", () => {
    let s = pos({ e2: ["cho", "general"], d10: ["han", "general"], a1: ["cho", "chariot"] }, "cho");
    // 초만 왕복하고 한은 패스. 초기 배치 B0는 (B0,cho)/(B0,han) 두 국면으로 갈라져 카운트된다.
    for (const a of [move("a1", "a2"), pass, move("a2", "a1"), pass, move("a1", "a2"), pass]) {
      s = applyAction(s, a);
      expect(s.result).toBeNull();
    }
    s = applyAction(s, move("a2", "a1")); // (B0, han) 2회째 — 배치만 보면 B0는 이미 4번째 등장
    expect(s.result).toBeNull();
    s = applyAction(s, pass); // (B0, cho) 3회째
    expect(s.result).toEqual({ type: "draw", reason: "repetition" });
  });
});

/* =====================================================================================
 * J. perft · 픽스처 교차 검증
 * ===================================================================================*/

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/e2e/fixtures");
interface Fixture {
  moves: Array<{ from: string; to: string }>;
  expect: { captureAt?: number; capturedType?: string; result?: string; winner?: Side };
}
const loadFixture = (n: string): Fixture => JSON.parse(readFileSync(resolve(FIXTURE_DIR, n), "utf8")) as Fixture;

describe("[감사 J] perft · 픽스처 교차 검증", () => {
  /** RULES.md 2·3절에서 손으로 센 초기 국면 초의 수 개수 (합 31). */
  const CHO_HAND_COUNT: Record<string, number> = {
    a4: 2, c4: 3, e4: 3, g4: 3, i4: 2, // 졸 13 (a/i는 옆 한 방향이 보드 밖)
    a1: 2, i1: 2, // 차 4 (b1/h1 아군, 위로는 a4/i4 앞까지)
    b1: 2, h1: 2, // 마 4 (좌우 멱은 아군, 위 멱만 열림)
    c1: 0, g1: 0, // 상 0 (모든 경로가 아군 졸/포에 막힘)
    b3: 0, h3: 0, // 포 0 (세로 포다리가 적 포, 가로 포다리도 아군 포)
    d1: 2, f1: 2, // 사 4 (대각 e2는 아군 궁)
    e2: 6, // 궁 (가로세로 4 + 대각 d3/f3)
  };
  const HAN_HAND_COUNT: Record<string, number> = {
    a7: 2, c7: 3, e7: 3, g7: 3, i7: 2,
    a10: 2, i10: 2,
    b10: 2, h10: 2,
    c10: 0, g10: 0,
    b8: 0, h8: 0,
    d10: 2, f10: 2,
    e9: 6,
  };

  it("J1: 초기 국면 초의 기물별 수 개수가 RULES.md 손계산과 일치하고 합이 31", () => {
    const s = initialState();
    let total = 0;
    for (const [at, n] of Object.entries(CHO_HAND_COUNT)) {
      expect(notes(legalMovesFrom(s, sq(at))).length, `${at}`).toBe(n);
      total += n;
    }
    expect(total).toBe(31);
    expect(allLegalActions(s)).toHaveLength(32); // 31 + 한수쉼
    expect(perft(s, 1)).toBe(32);
  });

  it("J2: 한의 초기 응수도 손계산 31 + 패스 = 32", () => {
    const s = applyAction(initialState(), pass);
    let total = 0;
    for (const [at, n] of Object.entries(HAN_HAND_COUNT)) {
      expect(notes(legalMovesFrom(s, sq(at))).length, `${at}`).toBe(n);
      total += n;
    }
    expect(total).toBe(31);
    expect(allLegalActions(s)).toHaveLength(32);
  });

  it("J3: 초의 32개 액션 어느 것도 한의 응수 개수(32)를 바꾸지 않는다 → depth2 = 32*32 = 1024", () => {
    const s = initialState();
    const actions = allLegalActions(s);
    expect(actions).toHaveLength(32);
    let sum = 0;
    for (const a of actions) {
      const next = applyAction(s, a);
      const n = allLegalActions(next).length;
      const label = a.kind === "pass" ? "pass" : `${toNotation(a.move.from)}${toNotation(a.move.to)}`;
      expect(n, `after ${label}`).toBe(32);
      sum += n;
    }
    expect(sum).toBe(1024);
    expect(perft(s, 2)).toBe(1024);
  });

  it("J4: capture-game.json — 전 수 합법, 6번 인덱스에서 초 차가 a7 한 병을 포획, 그 외 포획 없음", () => {
    const fx = loadFixture("capture-game.json");
    let s = initialState();
    const before: GameState[] = [];
    fx.moves.forEach((m, i) => {
      before.push(s);
      const a = move(m.from, m.to);
      expect(isLegal(s, a), `move ${i} ${m.from}->${m.to}`).toBe(true);
      // 레퍼런스 구현으로도 합법인지 독립 확인
      const piece = s.board[parseNotation(m.from).rank]![parseNotation(m.from).file]!;
      expect(piece.side).toBe(s.turn);
      expect(refLegalFrom(s.board, rparse(m.from), piece)).toContain(m.to);
      s = applyAction(s, a);
    });
    const captureIdx = fx.expect.captureAt!;
    expect(captureIdx).toBe(6);
    s.history.forEach((h, i) => {
      if (i === captureIdx) {
        expect(h.captured).toMatchObject({ side: "han", type: "soldier" });
        expect(h.notation).toBe("a1a7");
      } else {
        expect(h.captured, `ply ${i}`).toBeNull();
      }
    });
    const mover = before[captureIdx]!.board[parseNotation("a1").rank]![parseNotation("a1").file];
    expect(mover).toMatchObject({ side: "cho", type: "chariot" });
    expect(s.result).toBeNull();
    expect(s.history).toHaveLength(7);
  });

  it("J5: mate-game.json — 마지막 수만 외통이며 한의 모든 의사합법 수가 장군을 벗어나지 못한다", () => {
    const fx = loadFixture("mate-game.json");
    let s = initialState();
    fx.moves.forEach((m, i) => {
      const a = move(m.from, m.to);
      expect(isLegal(s, a), `move ${i} ${m.from}->${m.to}`).toBe(true);
      s = applyAction(s, a);
      if (i < fx.moves.length - 1) expect(s.result, `ply ${i}`).toBeNull();
    });
    expect(s.result).toEqual({ type: "checkmate", winner: "cho" });

    // 독립 검증: 레퍼런스 구현으로 한의 모든 수를 전수 시도해도 장군이 남는다
    expect(refIsCheck(s.board, "han")).toBe(true);
    const tries = refAllMoves(s.board, "han");
    expect(tries.length).toBeGreaterThan(0);
    for (const t of tries) {
      expect(refIsCheck(refApply(s.board, t.from, t.to), "han"), `${rnot(t.from)}->${rnot(t.to)}`).toBe(true);
    }
    // 재구성한 국면에서도 외통 판정이 동일해야 한다
    const rebuilt = stateFrom(s.board, "han");
    expect(isCheckmate(rebuilt)).toBe(true);
    expect(allLegalActions(rebuilt)).toEqual([]);
  });

  it("J7: 엔진 perft(1~3)이 RULES.md 레퍼런스 구현의 독립 계산과 완전히 일치 (32 / 1024 / 32964)", () => {
    const s = initialState();
    expect(refPerft(s.board, "cho", 1)).toBe(32);
    expect(perft(s, 1)).toBe(refPerft(s.board, "cho", 1));
    expect(refPerft(s.board, "cho", 2)).toBe(1024);
    expect(perft(s, 2)).toBe(refPerft(s.board, "cho", 2));
    // depth3은 32^3=32768이 아니다: 빅장으로 죽는 가지와 새로 열리는 수가 상쇄되지 않는다
    expect(refPerft(s.board, "cho", 3)).toBe(32964);
    expect(perft(s, 3)).toBe(refPerft(s.board, "cho", 3));
  });

  it("J8: 초기 국면에서 2수 만에 빅장이 되는 조합 12개를 엔진이 정확히 draw/facing으로 끝낸다", () => {
    const s = initialState();
    const found: string[] = [];
    for (const a of allLegalActions(s)) {
      const s1 = applyAction(s, a);
      expect(s1.result).toBeNull();
      for (const b of allLegalActions(s1)) {
        const s2 = applyAction(s1, b);
        if (s2.result) {
          expect(s2.result).toEqual({ type: "draw", reason: "facing" });
          expect(isFacing(s2.board)).toBe(true);
          found.push(`${s1.history.at(-1)!.notation}/${s2.history.at(-1)!.notation}`);
        }
      }
    }
    // 궁이 같은 파일로 마주 서는 4x2, e파일 졸/병이 동시에 비켜서는 2x2 = 12가지
    expect(found.sort()).toEqual(
      [
        "e2f2/e9f9", "e2f2/e9f8", "e2d2/e9d9", "e2d2/e9d8",
        "e2f3/e9f9", "e2f3/e9f8", "e2d3/e9d9", "e2d3/e9d8",
        "e4d4/e7d7", "e4d4/e7f7", "e4f4/e7d7", "e4f4/e7f7",
      ].sort(),
    );
  });

  it("J6: perft(1)은 allLegalActions 길이와 항상 같고 종료 국면은 0", () => {
    const s = initialState();
    expect(perft(s, 1)).toBe(allLegalActions(s).length);
    expect(perft(s, 0)).toBe(1);
    const mate = applyAction(
      pos(
        { d10: ["han", "general"], d4: ["cho", "elephant"], a9: ["cho", "chariot"], g9: ["cho", "horse"], e1: ["cho", "general"] },
        "cho",
      ),
      move("d4", "f7"),
    );
    expect(perft(mate, 1)).toBe(0);
    expect(perft(mate, 3)).toBe(0);
  });
});

/* =====================================================================================
 * K. API 계약 (docs/ENGINE_API.md)
 * ===================================================================================*/

describe("[감사 K] API 계약 — docs/ENGINE_API.md", () => {
  it("K1: applyAction은 deep-freeze된 원본 state를 변형하지 않는다", () => {
    const s0 = deepFreezeState(initialState());
    const before = snapshot(s0);
    const s1 = applyAction(s0, move("a4", "a5"));
    expect(snapshot(s0)).toBe(before);
    expect(s0.board).not.toBe(s1.board);
    expect(s0.history).toHaveLength(0);
    expect(s1.history).toHaveLength(1);
    expect(s0.positionCounts.size).toBe(1);
  });

  it("K2: 포획 수와 패스 이후에도 원본 state는 그대로다", () => {
    const s0 = deepFreezeState(
      pos({ a1: ["cho", "chariot"], a7: ["han", "soldier"], e2: ["cho", "general"], d10: ["han", "general"] }, "cho"),
    );
    const before = snapshot(s0);
    applyAction(s0, move("a1", "a7"));
    applyAction(s0, pass);
    expect(snapshot(s0)).toBe(before);
  });

  it("K3: legalMovesFrom 빈 배열 규약 — 빈 칸 / 상대 기물 / 종료 국면", () => {
    const s = initialState();
    expect(legalMovesFrom(s, sq("e5"))).toEqual([]); // 빈 칸
    expect(legalMovesFrom(s, sq("a7"))).toEqual([]); // 상대 기물
    const done = applyAction(
      pos(
        { d10: ["han", "general"], d4: ["cho", "elephant"], a9: ["cho", "chariot"], g9: ["cho", "horse"], e1: ["cho", "general"] },
        "cho",
      ),
      move("d4", "f7"),
    );
    expect(legalMovesFrom(done, sq("f7"))).toEqual([]); // 종료 국면
  });

  it("K4: legalMovesFrom은 매번 새 배열을 돌려주고 호출자가 변형해도 엔진에 영향이 없다", () => {
    const s = initialState();
    const a = legalMovesFrom(s, sq("e2"));
    const b = legalMovesFrom(s, sq("e2"));
    expect(a).not.toBe(b);
    a.length = 0;
    expect(legalMovesFrom(s, sq("e2"))).toHaveLength(6);
  });

  it("K5: toNotation/parseNotation 왕복이 90칸 전부에서 성립한다", () => {
    for (let r = 0; r <= 9; r++) {
      for (let f = 0; f <= 8; f++) {
        const n = toNotation({ file: f, rank: r });
        expect(parseNotation(n)).toEqual({ file: f, rank: r });
        expect(n).toBe(rnot({ f, r }));
      }
    }
  });

  it("K6: 잘못된 표기·보드 밖 좌표는 EngineError", () => {
    for (const bad of ["e0", "e11", "j1", "a", "10", "E2", "e 2", ""]) {
      expect(() => parseNotation(bad), bad).toThrow(EngineError);
    }
    expect(() => toNotation({ file: 9, rank: 0 })).toThrow(EngineError);
    expect(() => toNotation({ file: 0, rank: 10 })).toThrow(EngineError);
  });

  it("K7: isLegal은 상대 차례 기물·빈 칸·존재하지 않는 수에 대해 false", () => {
    const s = initialState();
    expect(isLegal(s, move("a7", "a6"))).toBe(false); // 한 기물
    expect(isLegal(s, move("e5", "e6"))).toBe(false); // 빈 칸
    expect(isLegal(s, move("a4", "a6"))).toBe(false); // 졸은 2칸 못 감
    expect(isLegal(s, move("a4", "a3"))).toBe(false); // 후퇴 불가
    expect(isLegal(s, move("a4", "a5"))).toBe(true);
  });

  it("K8: AppliedAction 기록 형식 (notation / captured / check)", () => {
    const s = pos({ a1: ["cho", "chariot"], a7: ["han", "soldier"], e2: ["cho", "general"], d10: ["han", "general"] }, "cho");
    const n1 = applyAction(s, move("a1", "a7"));
    const h = n1.history.at(-1)!;
    expect(h.notation).toBe("a1a7");
    expect(h.captured).toMatchObject({ side: "han", type: "soldier" });
    expect(h.check).toBe(false);
    expect(h.action).toEqual({ kind: "move", move: { from: sq("a1"), to: sq("a7") } });
    const n2 = applyAction(n1, pass);
    expect(n2.history.at(-1)!.notation).toBe("pass");
    expect(n2.history.at(-1)!.captured).toBeNull();
  });

  it("K11: 제자리 수·보드 밖 좌표는 비합법이며 EngineError로 거부된다", () => {
    const s = initialState();
    expect(isLegal(s, move("a4", "a4"))).toBe(false);
    expect(() => applyAction(s, move("a4", "a4"))).toThrow(EngineError);
    const outside: Action = { kind: "move", move: { from: { file: -1, rank: 0 }, to: { file: 0, rank: 0 } } };
    expect(legalMovesFrom(s, { file: -1, rank: 0 })).toEqual([]);
    expect(legalMovesFrom(s, { file: 20, rank: 20 })).toEqual([]);
    expect(isLegal(s, outside)).toBe(false);
    expect(() => applyAction(s, outside)).toThrow(EngineError);
  });

  it("K12: perft의 depth 0·음수는 1 (수순 1개 = 아무 것도 두지 않음)", () => {
    const s = initialState();
    expect(perft(s, 0)).toBe(1);
    expect(perft(s, -3)).toBe(1);
  });

  it("K9: initialState()는 매번 독립 인스턴스", () => {
    const a = initialState();
    const b = initialState();
    expect(a).not.toBe(b);
    expect(a.board).not.toBe(b.board);
    expect(snapshot(a)).toBe(snapshot(b));
    applyAction(a, move("a4", "a5"));
    expect(snapshot(a)).toBe(snapshot(b));
  });

  it("K10: 초기 국면의 32개 액션은 모두 applyAction으로 재생 가능하고 서로 다른 국면을 만든다", () => {
    const s = initialState();
    const seen = new Set<string>();
    for (const a of allLegalActions(s)) {
      const n = applyAction(s, a);
      expect(n.turn).toBe("han");
      expect(n.result).toBeNull();
      seen.add(snapshot(n));
    }
    expect(seen.size).toBe(32);
  });
});

/* =====================================================================================
 * L. 레퍼런스 구현과의 무작위 교차 검증 (퍼징)
 * ===================================================================================*/

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const FUZZ_TYPES: PieceType[] = ["guard", "chariot", "cannon", "horse", "elephant", "soldier"];

/**
 * @param palaceBias 0..1 — 이 확률로 기물을 궁성 9칸 안에 떨어뜨린다.
 *        (궁성은 보드의 20%뿐이라 균등 배치만으로는 대각선 규칙이 과소 표집된다)
 */
function randomBoard(rng: () => number, palaceBias = 0): Board {
  const b = emptyBoard();
  const put = (f: number, r: number, p: Piece): void => {
    b[r]![f] = p;
  };
  const inPalace = (pal: RRect): [number, number] => [
    pal.f0 + Math.floor(rng() * 3),
    pal.r0 + Math.floor(rng() * 3),
  ];
  const [cf, cr] = inPalace(CHO_PAL);
  put(cf, cr, { side: "cho", type: "general", id: "cho-general-1" });
  const [hf, hr] = inPalace(HAN_PAL);
  put(hf, hr, { side: "han", type: "general", id: "han-general-1" });
  const n = 4 + Math.floor(rng() * 12);
  for (let i = 0; i < n; i++) {
    let f: number;
    let r: number;
    if (rng() < palaceBias) {
      [f, r] = inPalace(rng() < 0.5 ? CHO_PAL : HAN_PAL);
    } else {
      f = Math.floor(rng() * 9);
      r = Math.floor(rng() * 10);
    }
    if (b[r]![f]) continue;
    const type = FUZZ_TYPES[Math.floor(rng() * FUZZ_TYPES.length)]!;
    const side: Side = rng() < 0.5 ? "cho" : "han";
    put(f, r, { side, type, id: `${side}-${type}-${i}` });
  }
  return b;
}

describe("[감사 L] RULES.md 레퍼런스 구현과의 무작위 교차 검증", () => {
  it("L0: 레퍼런스가 RULES.md 테스트 벡터(V11/V13/V16/V20/V21)를 그대로 재현한다 (레퍼런스 자체 검증)", () => {
    const b1 = emptyBoard();
    b1[4]![4] = { side: "cho", type: "horse", id: "h" };
    expect(refMoves(b1, { f: 4, r: 4 }, b1[4]![4]!).map(rnot).sort()).toEqual(
      ["c4", "c6", "d3", "d7", "f3", "f7", "g4", "g6"], // V11: 8곳
    );
    const b2 = emptyBoard();
    b2[4]![4] = { side: "cho", type: "elephant", id: "e" };
    expect(refMoves(b2, { f: 4, r: 4 }, b2[4]![4]!).map(rnot).sort()).toEqual(
      ["b3", "b7", "c2", "c8", "g2", "g8", "h3", "h7"], // V13
    );
    const b3 = emptyBoard();
    b3[4]![4] = { side: "cho", type: "soldier", id: "p" };
    expect(refMoves(b3, { f: 4, r: 4 }, b3[4]![4]!).map(rnot).sort()).toEqual(["d5", "e6", "f5"]); // V16
    const b4 = emptyBoard();
    b4[1]![3] = { side: "cho", type: "guard", id: "s" };
    expect(refMoves(b4, { f: 3, r: 1 }, b4[1]![3]!).map(rnot).sort()).toEqual(["d1", "d3", "e2"]); // V20
    const b5 = emptyBoard();
    b5[1]![4] = { side: "cho", type: "general", id: "g" };
    expect(refMoves(b5, { f: 4, r: 1 }, b5[1]![4]!).map(rnot).sort()).toEqual(
      ["d1", "d2", "d3", "e1", "e3", "f1", "f2", "f3"], // V21: 8방
    );
  });

  it("L1: 초기 배치의 모든 기물에서 의사합법 수가 레퍼런스와 일치", () => {
    const board = initialState().board;
    for (let r = 0; r <= 9; r++) {
      for (let f = 0; f <= 8; f++) {
        const p = board[r]![f];
        if (!p) continue;
        const n = rnot({ f, r });
        expect(implMoves(board, n), n).toEqual(refMoves(board, { f, r }, p).map(rnot).sort());
      }
    }
  });

  it("L2: 무작위 400국면 x 전 기물 — 의사합법 수가 레퍼런스와 완전히 일치하고 중복이 없다", () => {
    const rng = makeRng(0xa11ce);
    for (let iter = 0; iter < 400; iter++) {
      const board = randomBoard(rng);
      for (let r = 0; r <= 9; r++) {
        for (let f = 0; f <= 8; f++) {
          const p = board[r]![f];
          if (!p) continue;
          const impl = pseudoLegalMovesFrom(board, { file: f, rank: r }).map(toNotation);
          expect(new Set(impl).size, `dup at ${rnot({ f, r })} iter ${iter}`).toBe(impl.length);
          expect(impl.slice().sort(), `${p.side} ${p.type} @${rnot({ f, r })} iter ${iter}`).toEqual(
            refMoves(board, { f, r }, p).map(rnot).sort(),
          );
        }
      }
    }
  });

  it("L3: 무작위 400국면 — isCheck 판정이 레퍼런스와 일치", () => {
    const rng = makeRng(0xbeef);
    for (let iter = 0; iter < 400; iter++) {
      const board = randomBoard(rng);
      for (const side of ["cho", "han"] as Side[]) {
        const st = stateFrom(board, side);
        expect(isCheck(st, side), `${side} iter ${iter}`).toBe(refIsCheck(board, side));
      }
    }
  });

  it("L4: 무작위 250국면 — 자살수 필터를 거친 합법 수도 레퍼런스와 일치", () => {
    const rng = makeRng(0xc0ffee);
    for (let iter = 0; iter < 250; iter++) {
      const board = randomBoard(rng);
      const turn: Side = iter % 2 === 0 ? "cho" : "han";
      const st = stateFrom(board, turn);
      for (let r = 0; r <= 9; r++) {
        for (let f = 0; f <= 8; f++) {
          const p = board[r]![f];
          if (!p || p.side !== turn) continue;
          expect(notes(legalMovesFrom(st, { file: f, rank: r })), `${rnot({ f, r })} iter ${iter}`).toEqual(
            refLegalFrom(board, { f, r }, p),
          );
        }
      }
    }
  });

  it("L2b: 궁성 편중(80%) 무작위 500국면 — 궁성 대각 규칙까지 레퍼런스와 일치", () => {
    const rng = makeRng(0x9a1ace);
    for (let iter = 0; iter < 500; iter++) {
      const board = randomBoard(rng, 0.8);
      for (let r = 0; r <= 9; r++) {
        for (let f = 0; f <= 8; f++) {
          const p = board[r]![f];
          if (!p) continue;
          expect(
            implMoves(board, rnot({ f, r })),
            `${p.side} ${p.type} @${rnot({ f, r })} iter ${iter}`,
          ).toEqual(refMoves(board, { f, r }, p).map(rnot).sort());
        }
      }
      for (const side of ["cho", "han"] as Side[]) {
        expect(isCheck(stateFrom(board, side), side), `check ${side} iter ${iter}`).toBe(
          refIsCheck(board, side),
        );
      }
    }
  });

  it("L5: 무작위 200국면 — 합법 액션 집합이 레퍼런스 + 한수쉼 규약과 일치", () => {
    const rng = makeRng(0xd00d);
    for (let iter = 0; iter < 200; iter++) {
      const board = randomBoard(rng, iter % 3 === 0 ? 0.7 : 0);
      const turn: Side = iter % 2 === 0 ? "han" : "cho";
      const st = stateFrom(board, turn);
      const expected: string[] = [];
      for (let r = 0; r <= 9; r++) {
        for (let f = 0; f <= 8; f++) {
          const p = board[r]![f];
          if (!p || p.side !== turn) continue;
          for (const to of refLegalFrom(board, { f, r }, p)) expected.push(`${rnot({ f, r })}${to}`);
        }
      }
      if (!refIsCheck(board, turn)) expected.push("pass"); // RULES.md 4절: 장군 상태에서는 패스 불가
      expect(actionKeys(st), `iter ${iter}`).toEqual(expected.sort());
    }
  });
});

/* =====================================================================================
 * N. 실제 대국 무작위 플레이아웃 — 게임 레이어 불변식 (RULES.md 4절 / ENGINE_API 판정 의무)
 * ===================================================================================*/

const countPieces = (b: Board): number => b.flat().filter(Boolean).length;

describe("[감사 N] 무작위 플레이아웃 불변식", () => {
  it("N1: 초기 국면에서 20판을 끝까지 진행해도 판정 의무 불변식이 전부 유지된다", () => {
    const rng = makeRng(0x5eed);
    let mates = 0;
    let facings = 0;
    let repetitions = 0;
    for (let game = 0; game < 20; game++) {
      let s = initialState();
      for (let ply = 0; ply < 120 && !s.result; ply++) {
        const mover = s.turn;
        const foe: Side = mover === "cho" ? "han" : "cho";
        const actions = allLegalActions(s);
        expect(actions.length, `game ${game} ply ${ply}`).toBeGreaterThan(0);

        // (1) 목록에 오른 액션은 전부 isLegal true
        for (const a of actions) expect(isLegal(s, a)).toBe(true);
        // (2) 장군 중이면 패스는 절대 목록에 없다 (RULES.md 4절)
        expect(actions.some((a) => a.kind === "pass")).toBe(!isCheck(s, mover));
        // (3) 합법 수 중 적 궁을 잡는 수는 존재할 수 없다 (상대는 직전에 장군을 벗어났으므로)
        const foeGeneral = findGeneral(s.board, foe)!;
        for (const a of actions) {
          if (a.kind !== "move") continue;
          expect(
            a.move.to.file === foeGeneral.file && a.move.to.rank === foeGeneral.rank,
            `game ${game} ply ${ply}: 적 궁 포획 수가 생성됨`,
          ).toBe(false);
        }
        // (4) legalMovesFrom 과 allLegalActions 는 같은 집합을 말한다
        const fromAll = actions
          .filter((a): a is Extract<Action, { kind: "move" }> => a.kind === "move")
          .map((a) => `${toNotation(a.move.from)}${toNotation(a.move.to)}`)
          .sort();
        const fromPer: string[] = [];
        for (let r = 0; r <= 9; r++)
          for (let f = 0; f <= 8; f++) {
            const p = s.board[r]![f];
            if (!p || p.side !== mover) continue;
            for (const d of legalMovesFrom(s, { file: f, rank: r }))
              fromPer.push(`${toNotation({ file: f, rank: r })}${toNotation(d)}`);
          }
        expect(fromPer.sort()).toEqual(fromAll);

        const beforeSnap = snapshot(s);
        const beforeCount = countPieces(s.board);
        const action = actions[Math.floor(rng() * actions.length)]!;
        const next = applyAction(s, action);

        // (5) 순수성
        expect(snapshot(s)).toBe(beforeSnap);
        // (6) 차례 전환 · 이력 append
        expect(next.turn).toBe(foe);
        expect(next.history).toHaveLength(s.history.length + 1);
        const applied = next.history.at(-1)!;
        expect(applied.action).toBe(action);
        // (7) 포획 기록과 기물 수가 일치
        expect(countPieces(next.board)).toBe(beforeCount - (applied.captured ? 1 : 0));
        expect(applied.notation).toBe(
          action.kind === "pass"
            ? "pass"
            : `${toNotation(action.move.from)}${toNotation(action.move.to)}`,
        );
        // (8) 자기 궁을 장군에 노출시키는 수는 절대 통과하지 않는다 (자살수 금지)
        expect(isCheck(next, mover)).toBe(false);
        // (9) check 플래그는 상대의 실제 장군 여부
        expect(applied.check).toBe(isCheck(next, foe));

        // (10) 결과 판정의 근거가 실제로 성립하는가
        if (next.result?.type === "checkmate") {
          mates++;
          expect(next.result.winner).toBe(mover);
          const rebuilt = stateFrom(next.board, foe);
          expect(isCheck(rebuilt, foe)).toBe(true);
          expect(allLegalActions(rebuilt)).toEqual([]);
          expect(refIsCheck(next.board, foe)).toBe(true);
          for (const t of refAllMoves(next.board, foe))
            expect(refIsCheck(refApply(next.board, t.from, t.to), foe)).toBe(true);
        } else if (next.result?.reason === "facing") {
          facings++;
          expect(isFacing(next.board)).toBe(true);
        } else if (next.result?.reason === "repetition") {
          repetitions++;
          expect(next.positionCounts.get(positionKey(next.board, next.turn))).toBeGreaterThanOrEqual(3);
        } else {
          // 진행 중이라면 빅장도 3회 반복도 아니어야 한다
          expect(isFacing(next.board)).toBe(false);
        }
        s = next;
      }
    }
    // 20판이 전부 무한 진행만 하지는 않았는지 (판정 경로가 실제로 밟혔는지) 확인
    expect(mates + facings + repetitions).toBeGreaterThan(0);
  });

  it("N1b: 무작위 대국은 빅장 무승부로 자주 끝나며, 끝나기 전에는 절대 빅장이 아니다", () => {
    const rng = makeRng(0x5eed);
    const tally = { checkmate: 0, facing: 0, repetition: 0, ongoing: 0 };
    for (let game = 0; game < 20; game++) {
      let s = initialState();
      for (let ply = 0; ply < 120 && !s.result; ply++) {
        expect(isFacing(s.board), `game ${game} ply ${ply}`).toBe(false);
        const actions = allLegalActions(s);
        s = applyAction(s, actions[Math.floor(rng() * actions.length)]!);
      }
      if (!s.result) tally.ongoing++;
      else if (s.result.type === "checkmate") tally.checkmate++;
      else tally[s.result.reason]++;
    }
    expect(tally.facing).toBeGreaterThan(0);
    expect(tally.facing + tally.repetition + tally.checkmate + tally.ongoing).toBe(20);
  });

  it("N1c: 외통으로 끝나는 기보(mate-game)에도 동일한 불변식이 전부 성립한다", () => {
    const fx = loadFixture("mate-game.json");
    let s = initialState();
    fx.moves.forEach((m, i) => {
      const mover = s.turn;
      const foe: Side = mover === "cho" ? "han" : "cho";
      const actions = allLegalActions(s);
      // 적 궁을 잡는 합법 수는 어느 시점에도 존재하지 않는다
      const foeGeneral = findGeneral(s.board, foe)!;
      for (const a of actions)
        if (a.kind === "move")
          expect(a.move.to.file === foeGeneral.file && a.move.to.rank === foeGeneral.rank).toBe(false);
      // 엔진의 액션 집합 == 레퍼런스 액션 집합
      expect(actionKeys(s), `ply ${i}`).toEqual(refLegalActions(s.board, mover).map(refKey).sort());
      const before = snapshot(s);
      s = applyAction(s, move(m.from, m.to));
      expect(snapshot(s)).not.toBe(before);
      expect(isCheck(s, mover)).toBe(false);
      expect(s.history.at(-1)!.check).toBe(isCheck(s, foe));
    });
    expect(s.result).toEqual({ type: "checkmate", winner: "cho" });
    // 외통 국면에서 레퍼런스 액션 집합도 공집합이어야 한다 (패스 포함 안 됨)
    expect(refLegalActions(s.board, "han")).toEqual([]);
  });

  it("N2: 종료된 국면은 어떤 경로로도 다시 진행되지 않는다", () => {
    const rng = makeRng(0x7777);
    let finished = 0;
    for (let game = 0; game < 40 && finished < 6; game++) {
      let s = initialState();
      for (let ply = 0; ply < 200 && !s.result; ply++) {
        const actions = allLegalActions(s);
        s = applyAction(s, actions[Math.floor(rng() * actions.length)]!);
      }
      if (!s.result) continue;
      finished++;
      expect(allLegalActions(s)).toEqual([]);
      expect(isLegal(s, pass)).toBe(false);
      expect(() => applyAction(s, pass)).toThrow(EngineError);
      expect(perft(s, 1)).toBe(0);
      for (let r = 0; r <= 9; r++)
        for (let f = 0; f <= 8; f++) expect(legalMovesFrom(s, { file: f, rank: r })).toEqual([]);
    }
    expect(finished).toBeGreaterThan(0);
  });
});

/* =====================================================================================
 * M. DECISIONS.md 좌표 정정 독립 재검증 (V14 / V15 / V25)
 * ===================================================================================*/

describe("[감사 M] DECISIONS.md의 V14/V15/V25 좌표 정정 재검증", () => {
  it("M1: V14 정정 타당 — e5 상의 g8 경로는 {e6,f7}, h7 경로는 {f5,g6}이라 f6은 어느 쪽도 막지 않는다", () => {
    // 기하 재유도: (4,4)→(6,7)은 직선 (0,1) 후 대각 (1,1) 2회 → e6, f7. f6=(5,5)는 경로가 아니다.
    const blocked = pos({ e5: ["cho", "elephant"], f6: ["han", "soldier"] }, "cho");
    expect(legal(blocked, "e5")).toEqual(["b3", "b7", "c2", "c8", "g2", "g8", "h3", "h7"]);
    const realBlock = pos({ e5: ["cho", "elephant"], f7: ["han", "soldier"] }, "cho");
    expect(legal(realBlock, "e5")).not.toContain("g8");
  });

  it("M2: V15 정정 타당 — e6이 막으면 죽는 도착점은 d8/f8이 아니라 c8/g8이다", () => {
    const s = pos({ e5: ["cho", "elephant"], e6: ["han", "soldier"] }, "cho");
    const d = legal(s, "e5");
    expect(d).not.toContain("c8");
    expect(d).not.toContain("g8");
    expect(d).toEqual(["b3", "b7", "c2", "g2", "h3", "h7"]);
    // 애초에 d8/f8은 상의 도착점 형태 (±2,±3)/(±3,±2)가 아니다
    const open = pos({ e5: ["cho", "elephant"] }, "cho");
    expect(legal(open, "e5")).not.toContain("d8");
    expect(legal(open, "e5")).not.toContain("f8");
  });

  it("M3: V25 정정 타당 — e3 사는 e3에 대각선이 없고 e4는 궁성 밖이라 핀 상태에서 합법수 0", () => {
    const s = pos(
      { e2: ["cho", "general"], e3: ["cho", "guard"], e6: ["han", "chariot"], e9: ["han", "general"] },
      "cho",
    );
    // 핀이 없는 상태의 e3 사는 d3/e2/f3 3곳뿐 (e4 없음) — 그중 e2는 아군 궁
    expect(legal(s, "e3")).toEqual([]);
    const unpinned = pos({ e1: ["cho", "general"], e3: ["cho", "guard"], e9: ["han", "general"] }, "cho");
    expect(legal(unpinned, "e3")).toEqual(["d3", "e2", "f3"]);
  });

  it("M4: DECISIONS 1번(V01 → 14곳) 재유도 — 5랭크 8 + e4/e3 + e6~e9(적 궁 포획) = 14", () => {
    const s = pos({ e5: ["cho", "chariot"] }, "cho");
    expect(legal(s, "e5")).toEqual(
      ["a5", "b5", "c5", "d5", "f5", "g5", "h5", "i5", "e3", "e4", "e6", "e7", "e8", "e9"].sort(),
    );
    expect(legal(s, "e5")).toHaveLength(14);
  });

  it("M5: DECISIONS 5번(빅장은 장군이 아니다) 재검증 — 마주 본 두 궁은 서로를 공격하지 않는다", () => {
    const s = stateFrom(
      (() => {
        const b = emptyBoard();
        b[1]![4] = { side: "cho", type: "general", id: "cg" };
        b[8]![4] = { side: "han", type: "general", id: "hg" };
        return b;
      })(),
      "cho",
    );
    expect(isFacing(s.board)).toBe(true);
    expect(isCheck(s, "cho")).toBe(false);
    expect(isCheck(s, "han")).toBe(false);
    expect(isCheckmate(s)).toBe(false);
  });
});
