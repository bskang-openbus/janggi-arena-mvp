/**
 * P4 fixture generator — one legal 기보 per capturing piece type.
 *
 *   node --import ../../packages/engine/scripts/ts-resolve.mjs \
 *        scripts/generate-p4-fixtures.ts
 *
 * The Tier 2 gate needs a capture *by each of the seven piece types*, which the
 * opening alone can't produce: 사 and 궁 can never leave their palace, so the
 * only way either of them takes anything is if an enemy 병 walks in. 한수쉼 is a
 * legal action (docs/RULES.md), so the idle side simply passes while the other
 * manoeuvres — that keeps every sequence short and, more importantly, keeps it
 * *legal*, which is the only property the fixture has to have.
 *
 * Every sequence below is hand-designed and then verified here against the
 * engine: each action must be legal, and the last one must be a capture by the
 * expected piece type. A rejected action prints the legal alternatives at that
 * point so the sequence can be repaired without guesswork.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Action, GameState, PieceType, Side } from "engine";
import {
  allLegalActions,
  applyAction,
  initialState,
  isLegal,
  parseNotation,
  pieceAt,
  toNotation,
} from "engine";

type Step = { from: string; to: string } | { pass: true };

interface Design {
  file: string;
  captorType: PieceType;
  captor: Side;
  description: string;
  steps: Step[];
}

const PASS: Step = { pass: true };
const m = (from: string, to: string): Step => ({ from, to });

/** 한 병이 초 궁성(d1~f3)까지 내려오는 행군 — 사/궁 포획의 유일한 성립 조건. */
const MARCH_TO_PALACE: Step[] = [
  m("e7", "d7"),
  PASS,
  m("d7", "d6"),
  PASS,
  m("d6", "d5"),
  PASS,
  m("d5", "d4"),
  PASS,
  m("d4", "d3"),
];

const DESIGNS: Design[] = [
  {
    file: "p4-soldier.json",
    captorType: "soldier",
    captor: "cho",
    description: "초 졸(a4)이 a열을 따라 전진해 한 병(a7)을 포획 — 창격 연출",
    steps: [m("a4", "a5"), PASS, m("a5", "a6"), PASS, m("a6", "a7")],
  },
  {
    file: "p4-chariot.json",
    captorType: "chariot",
    captor: "cho",
    description: "초 졸이 비켜 a열을 열고 초 차(a1)가 직진해 한 병(a7)을 포획 — 돌진 참격",
    steps: [m("a4", "b4"), PASS, m("a1", "a7")],
  },
  {
    file: "p4-cannon.json",
    captorType: "cannon",
    captor: "cho",
    description:
      "초 졸이 b4로 이동해 포다리가 되고, 한 병이 b7로 들어오자 초 포(b3)가 넘어 포획 — 포격",
    steps: [m("a4", "b4"), m("a7", "b7"), m("b3", "b7")],
  },
  {
    file: "p4-horse.json",
    captorType: "horse",
    captor: "cho",
    description: "초 졸이 멱을 비켜주고 초 마(h1)가 3회 도약해 한 병(i7)을 포획 — 도약 강습",
    steps: [
      m("g4", "f4"),
      PASS,
      m("h1", "g3"),
      PASS,
      m("g3", "h5"),
      PASS,
      m("h5", "i7"),
    ],
  },
  {
    file: "p4-elephant.json",
    captorType: "elephant",
    captor: "cho",
    description: "초 졸이 자리를 비우고 초 상(c1)이 두 번 건너뛰어 한 병(c7)을 포획 — 진각 내려찍기",
    steps: [m("e4", "d4"), PASS, m("c1", "e4"), PASS, m("e4", "c7")],
  },
  {
    file: "p4-guard.json",
    captorType: "guard",
    captor: "cho",
    description:
      "한 병이 d열로 궁성까지 내려오자 초 사(d1→d2)가 d3에서 포획 — 호위검",
    steps: [m("d1", "d2"), ...MARCH_TO_PALACE, m("d2", "d3")],
  },
  {
    file: "p4-general.json",
    captorType: "general",
    captor: "cho",
    description:
      "한 병이 d열로 내려와 장군을 부르자 초 궁(e2→d2)이 직접 d3에서 포획 — 왕의 위엄",
    steps: [m("e2", "d2"), ...MARCH_TO_PALACE, m("d2", "d3")],
  },
];

function toAction(step: Step): Action {
  return "pass" in step
    ? { kind: "pass" }
    : { kind: "move", move: { from: parseNotation(step.from), to: parseNotation(step.to) } };
}

function label(step: Step): string {
  return "pass" in step ? "한수쉼" : `${step.from}→${step.to}`;
}

function legalSummary(state: GameState): string {
  return allLegalActions(state)
    .map((a) =>
      a.kind === "pass"
        ? "pass"
        : `${toNotation(a.move.from)}→${toNotation(a.move.to)}`,
    )
    .join(" ");
}

let failed = 0;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "e2e", "fixtures");

for (const design of DESIGNS) {
  let state = initialState();
  let captureAt = -1;
  let capturedType: PieceType | null = null;
  let ok = true;

  for (const [i, step] of design.steps.entries()) {
    const action = toAction(step);
    if (!isLegal(state, action)) {
      console.error(
        `✘ ${design.file}: step ${i + 1} (${label(step)}) is illegal\n` +
          `  turn=${state.turn} result=${state.result?.type ?? "none"}\n` +
          `  legal: ${legalSummary(state)}`,
      );
      ok = false;
      failed += 1;
      break;
    }
    state = applyAction(state, action);
    const applied = state.history[state.history.length - 1];
    if (applied.captured) {
      captureAt = i;
      capturedType = applied.captured.type;
    }
  }
  if (!ok) continue;

  const last = state.history[state.history.length - 1];
  const lastStep = design.steps[design.steps.length - 1];
  const captor =
    "pass" in lastStep ? null : pieceAt(state.board, parseNotation(lastStep.to));

  if (!last.captured || captureAt !== design.steps.length - 1) {
    console.error(`✘ ${design.file}: the final action is not a capture`);
    failed += 1;
    continue;
  }
  if (captor?.type !== design.captorType) {
    console.error(
      `✘ ${design.file}: captured by ${captor?.type ?? "?"}, expected ${design.captorType}`,
    );
    failed += 1;
    continue;
  }
  if (captor.side !== design.captor) {
    console.error(`✘ ${design.file}: captor side ${captor.side}`);
    failed += 1;
    continue;
  }

  const fixture = {
    description: design.description,
    moves: design.steps,
    expect: {
      captureAt,
      capturedType,
      captorType: design.captorType,
      captorSide: design.captor,
    },
  };
  writeFileSync(join(outDir, design.file), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(
    `✓ ${design.file.padEnd(20)} ${design.steps.length}수 · ${design.captorType} x ${capturedType} @${captureAt} · result=${state.result?.type ?? "playing"}`,
  );
}

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed verification`);
  process.exit(1);
}
console.log("\nall P4 fixtures verified against the engine");
