/**
 * AI 계약 검증 — docs/AI_API.md 5절 전부.
 *  A. 빠른 공격 판정(ai/attacks.ts)이 엔진 규칙과 완전히 동등한가
 *  B. 합법성 퍼즈 (300+ 국면 × 3난이도) · 자살수/비합법 패스 미반환
 *  C. seed 재현성
 *  D. 시간 예산 준수
 *  E. 전술 (1수 외통 선택, 공짜 기물 포획, 종료 국면 처리)
 *  F. 평가 함수 불변식
 */
import { describe, expect, it } from "vitest";
import { boardFrom, findGeneral, opponent, toNotation } from "../board.js";
import { allLegalActions, applyAction, initialState, isCheck, isLegal, stateFrom } from "../game.js";
import { allPseudoLegalMoves } from "../movegen.js";
import { EngineError } from "../types.js";
import type { GameState, PieceType, Side } from "../types.js";
import { attacked } from "./attacks.js";
import { DEFAULT_WEIGHTS, MATE, evaluate, materialOf } from "./eval.js";
import { chooseAiAction } from "./index.js";
import { makeRng } from "./rng.js";
import type { AiLevel } from "./types.js";

type Spec = Record<string, [Side, PieceType]>;

const LEVELS: AiLevel[] = [1, 2, 3];

function stateOf(spec: Spec, turn: Side): GameState {
  return stateFrom(boardFrom(spec), turn);
}

/** Random-playout positions: the only realistic sample of "무작위 진행 국면". */
function playoutPositions(count: number, seed: number, everyPly = 3): GameState[] {
  const rng = makeRng(seed);
  const out: GameState[] = [];
  let s = initialState();
  let ply = 0;
  while (out.length < count) {
    if (s.result || ply > 90) {
      s = initialState();
      ply = 0;
      continue;
    }
    const actions = allLegalActions(s);
    s = applyAction(s, actions[Math.floor(rng() * actions.length)]!);
    ply++;
    if (!s.result && ply % everyPly === 0) out.push(s);
  }
  return out;
}

/* =============================================================== A. attacks */

describe("[AI A] 빠른 공격 판정 ≡ 엔진 규칙", () => {
  it("A1: 모든 칸 × 양측에서 attacked()가 엔진 의사합법 수의 도착점 집합과 일치", () => {
    const positions = playoutPositions(60, 0xa11ce, 2);
    let compared = 0;
    for (const s of positions) {
      for (const by of ["cho", "han"] as Side[]) {
        const dests = new Set<number>();
        for (const mv of allPseudoLegalMoves(s.board, by)) dests.add(mv.to.rank * 9 + mv.to.file);
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 9; c++) {
            const p = s.board[r]![c];
            // 자기 기물이 놓인 칸은 엔진이 애초에 도착점으로 만들지 않고,
            // 포가 놓인 칸은 "포는 포를 잡지 못한다" 예외라 비교 대상에서 제외한다.
            if (p && (p.side === by || p.type === "cannon")) continue;
            compared++;
            expect(attacked(s.board, r, c, by), `${toNotation({ file: c, rank: r })} by ${by}`).toBe(
              dests.has(r * 9 + c),
            );
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(8000);
  });

  it("A2: 궁 위치 기준 attacked() ≡ isCheck (400+ 국면)", () => {
    const positions = playoutPositions(400, 0xbeef, 1);
    for (const s of positions) {
      for (const side of ["cho", "han"] as Side[]) {
        const g = findGeneral(s.board, side);
        expect(g).not.toBeNull();
        expect(attacked(s.board, g!.rank, g!.file, opponent(side))).toBe(isCheck(s, side));
      }
    }
  });

  it("A3: 멱·포다리 예외 — 손으로 만든 국면들", () => {
    // 마 멱이 막히면 장군이 아니다
    const blocked = boardFrom({
      e2: ["cho", "general"],
      d9: ["han", "general"],
      f4: ["han", "horse"],
      f3: ["cho", "soldier"], // 멱 (f4 → e2 경로의 다리)
    });
    expect(attacked(blocked, 1, 4, "han")).toBe(false);
    const open = boardFrom({ e2: ["cho", "general"], d9: ["han", "general"], f4: ["han", "horse"] });
    expect(attacked(open, 1, 4, "han")).toBe(true);
    // 포는 다리가 있어야 하고, 다리가 포면 넘지 못한다
    const noScreen = boardFrom({ e2: ["cho", "general"], d9: ["han", "general"], e7: ["han", "cannon"] });
    expect(attacked(noScreen, 1, 4, "han")).toBe(false);
    const withScreen = boardFrom({
      e2: ["cho", "general"],
      d9: ["han", "general"],
      e7: ["han", "cannon"],
      e5: ["cho", "soldier"],
    });
    expect(attacked(withScreen, 1, 4, "han")).toBe(true);
    const cannonScreen = boardFrom({
      e2: ["cho", "general"],
      d9: ["han", "general"],
      e7: ["han", "cannon"],
      e5: ["cho", "cannon"],
    });
    expect(attacked(cannonScreen, 1, 4, "han")).toBe(false);
  });
});

/* ======================================================== B. 합법성 퍼즈 */

describe("[AI B] 합법성", () => {
  it("B1: 무작위 진행 국면 320개 × 3난이도 — 반환 액션은 항상 isLegal", () => {
    const positions = playoutPositions(320, 0xc0ffee, 2);
    expect(positions.length).toBe(320);
    for (const s of positions) {
      for (const level of LEVELS) {
        const r = chooseAiAction(s, { level, seed: 7 + level, timeBudgetMs: 8 });
        expect(isLegal(s, r.action), `level ${level}`).toBe(true);
        expect(() => applyAction(s, r.action)).not.toThrow();
        expect(r.nodes).toBeGreaterThan(0);
        expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
      }
    }
  }, 120_000);

  it("B2: 기본 예산(축소판)으로도 8개 국면 × 3난이도가 모두 합법", () => {
    const positions = playoutPositions(8, 0xf00d, 7);
    for (const s of positions) {
      for (const level of LEVELS) {
        const r = chooseAiAction(s, { level, timeBudgetMs: 150 });
        expect(isLegal(s, r.action)).toBe(true);
        expect(r.depth).toBeGreaterThanOrEqual(1);
      }
    }
  }, 60_000);

  it("B3: 장군 상태에서는 패스를 반환하지 않고 반드시 장군을 벗어난다", () => {
    // 한 차 h2가 2랭크를 따라 초 궁 e2를 장군
    const s = stateOf(
      { e2: ["cho", "general"], d9: ["han", "general"], e5: ["cho", "soldier"], h2: ["han", "chariot"] },
      "cho",
    );
    expect(isCheck(s, "cho")).toBe(true);
    expect(allLegalActions(s).some((a) => a.kind === "pass")).toBe(false);
    for (const level of LEVELS) {
      for (let seed = 0; seed < 6; seed++) {
        const r = chooseAiAction(s, { level, seed });
        expect(r.action.kind).toBe("move");
        const next = applyAction(s, r.action);
        expect(isCheck(next, "cho")).toBe(false);
      }
    }
  }, 60_000);

  it("B4: 자살수(궁을 장군에 노출시키는 수)는 결코 선택되지 않는다", () => {
    const positions = playoutPositions(40, 0x5a5a, 3);
    for (const s of positions) {
      for (const level of LEVELS) {
        const r = chooseAiAction(s, { level, seed: 11, timeBudgetMs: 10 });
        const next = applyAction(s, r.action);
        expect(isCheck(next, s.turn)).toBe(false);
      }
    }
  }, 60_000);
});

/* ========================================================== C. 재현성 */

describe("[AI C] seed 재현성", () => {
  it("C1: 같은 seed → 액션·점수·깊이·노드 수가 완전히 동일 (3난이도)", () => {
    const positions = [initialState(), ...playoutPositions(3, 0x1234, 5)];
    for (const s of positions) {
      for (const level of LEVELS) {
        const a = chooseAiAction(s, { level, seed: 20260803, timeBudgetMs: 120 });
        const b = chooseAiAction(s, { level, seed: 20260803, timeBudgetMs: 120 });
        expect(b.action).toEqual(a.action);
        expect(b.score).toBe(a.score);
        expect(b.depth).toBe(a.depth);
        expect(b.nodes).toBe(a.nodes);
      }
    }
  }, 60_000);

  it("C2: seed가 다르면 초급은 여러 가지 수를 낸다 (무작위성 실재)", () => {
    const s = initialState();
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const r = chooseAiAction(s, { level: 1, seed });
      seen.add(JSON.stringify(r.action));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

/* ======================================================== D. 시간 예산 */

describe("[AI D] 시간 예산", () => {
  it("D1: 고급(무시드) 300ms 예산 — 실제 소요가 1.5배 이내", () => {
    for (const s of [initialState(), ...playoutPositions(2, 0x99, 6)]) {
      const r = chooseAiAction(s, { level: 3, timeBudgetMs: 300 });
      expect(r.elapsedMs).toBeLessThanOrEqual(450);
      expect(r.depth).toBeGreaterThanOrEqual(2);
    }
  }, 30_000);

  it("D2: 고급(무시드) 800ms 예산 — 1.5배 이내 + 초기 국면에서 깊이 3 이상", () => {
    const r = chooseAiAction(initialState(), { level: 3, timeBudgetMs: 800 });
    expect(r.elapsedMs).toBeLessThanOrEqual(1200);
    expect(r.depth).toBeGreaterThanOrEqual(3);
    expect(r.nodes).toBeGreaterThan(5000);
  }, 30_000);

  it("D3: 초급·중급은 예산을 훨씬 밑돈다", () => {
    const s = initialState();
    expect(chooseAiAction(s, { level: 1 }).elapsedMs).toBeLessThan(100);
    expect(chooseAiAction(s, { level: 2 }).elapsedMs).toBeLessThan(300);
  });
});

/* =========================================================== E. 전술 */

/** audit.test.ts H4와 같은 국면: 초 상 d4 → f7 이면 한 궁 d10이 외통. */
const MATE_IN_1: Spec = {
  d10: ["han", "general"],
  d4: ["cho", "elephant"],
  a9: ["cho", "chariot"],
  g9: ["cho", "horse"],
  e1: ["cho", "general"],
};

describe("[AI E] 전술", () => {
  it("E1: 1수 외통 국면 — 3난이도 모두 외통 수를 선택한다", () => {
    const s = stateOf(MATE_IN_1, "cho");
    for (const level of LEVELS) {
      for (let seed = 0; seed < 4; seed++) {
        const r = chooseAiAction(s, { level, seed, timeBudgetMs: 300 });
        const next = applyAction(s, r.action);
        expect(next.result, `level ${level} seed ${seed}`).toEqual({ type: "checkmate", winner: "cho" });
        expect(r.score).toBeGreaterThan(MATE / 2);
      }
    }
  }, 60_000);

  it("E2: 공짜 차는 잡는다 (중급·고급)", () => {
    const s = stateOf(
      {
        e2: ["cho", "general"],
        d9: ["han", "general"],
        e5: ["cho", "soldier"], // e파일 차단 → 빅장 무승부 유혹 제거
        a1: ["cho", "chariot"],
        a5: ["han", "chariot"],
      },
      "cho",
    );
    for (const level of [2, 3] as AiLevel[]) {
      const r = chooseAiAction(s, { level, seed: 3, timeBudgetMs: 300 });
      expect(r.action.kind).toBe("move");
      if (r.action.kind !== "move") throw new Error("unreachable");
      expect(`${toNotation(r.action.move.from)}${toNotation(r.action.move.to)}`).toBe("a1a5");
      expect(r.score).toBeGreaterThan(800);
    }
  }, 30_000);

  it("E3: 무의미한 한수쉼을 남발하지 않는다 (초기 국면 × 3난이도)", () => {
    const s = initialState();
    for (const level of LEVELS) {
      for (let seed = 0; seed < 8; seed++) {
        const r = chooseAiAction(s, { level, seed, timeBudgetMs: 120 });
        expect(r.action.kind, `level ${level} seed ${seed}`).toBe("move");
      }
    }
  }, 60_000);

  it("E4: 이미 끝난 대국이면 EngineError", () => {
    const s = stateOf(MATE_IN_1, "cho");
    const done = applyAction(s, { kind: "move", move: { from: { file: 3, rank: 3 }, to: { file: 5, rank: 6 } } });
    expect(done.result).not.toBeNull();
    expect(() => chooseAiAction(done, { level: 3 })).toThrow(EngineError);
    // 잘못된 레벨도 방어한다
    expect(() => chooseAiAction(initialState(), { level: 9 as AiLevel })).toThrow(EngineError);
  });

  it("E5: 빅장(즉시 무승부)을 우세한 쪽은 스스로 만들지 않는다", () => {
    // 초가 차 2개만큼 앞선 국면. 초 궁 d1 → e1(또는 e2)이면 한 궁 e10과 빅장 → 무승부.
    // d파일은 초 졸 d5가 막고 있어 열세인 한이 스스로 빅장을 만들 수는 없다.
    const s = stateOf(
      {
        d1: ["cho", "general"],
        e10: ["han", "general"],
        d5: ["cho", "soldier"],
        a1: ["cho", "chariot"],
        i1: ["cho", "chariot"],
      },
      "cho",
    );
    const facingMoves = new Set(["d1e1", "d1e2"]);
    for (const level of [2, 3] as AiLevel[]) {
      for (let seed = 0; seed < 4; seed++) {
        const r = chooseAiAction(s, { level, seed, timeBudgetMs: 200 });
        if (r.action.kind !== "move") continue;
        const key = `${toNotation(r.action.move.from)}${toNotation(r.action.move.to)}`;
        expect(facingMoves.has(key), `level ${level} seed ${seed} played ${key}`).toBe(false);
      }
    }
  }, 30_000);
});

/* ========================================================= F. 평가 함수 */

describe("[AI F] 평가 함수", () => {
  it("F1: 초기 국면은 완전 대칭 → 평가 0, 양측 관점이 부호 반대", () => {
    const b = initialState().board;
    expect(evaluate(b, "cho", DEFAULT_WEIGHTS) === 0).toBe(true);
    expect(evaluate(b, "han", DEFAULT_WEIGHTS) === 0).toBe(true);
    const s = playoutPositions(5, 0x1111, 4);
    for (const st of s) {
      expect(evaluate(st.board, "cho")).toBe(-evaluate(st.board, "han"));
    }
  });

  it("F2: 기물 점수 서열 — 차13 포7 마5 상3 사3 졸2, 궁은 0", () => {
    const b = boardFrom({ e2: ["cho", "general"], d9: ["han", "general"] });
    expect(materialOf(b, "cho")).toBe(0);
    const withChariot = boardFrom({ e2: ["cho", "general"], d9: ["han", "general"], a1: ["cho", "chariot"] });
    expect(evaluate(withChariot, "cho")).toBeGreaterThan(1300);
    expect(evaluate(withChariot, "han")).toBeLessThan(-1300);
  });

  it("F3: 졸 전진과 차 기동력에 소량 가중이 붙는다 (물량을 뒤집지 않는 크기)", () => {
    const back = boardFrom({ e2: ["cho", "general"], d9: ["han", "general"], e4: ["cho", "soldier"] });
    const fwd = boardFrom({ e2: ["cho", "general"], d9: ["han", "general"], e6: ["cho", "soldier"] });
    const advanced = evaluate(fwd, "cho") - evaluate(back, "cho");
    expect(advanced).toBeGreaterThan(0);
    expect(advanced).toBeLessThan(200); // 졸 하나 값보다 작아야 한다
  });
});
