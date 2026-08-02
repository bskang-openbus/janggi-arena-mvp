/**
 * perft self-check for the initial position (TASKS.md P1 마지막 항목).
 * Run: node --import ./scripts/ts-resolve.mjs scripts/perft.ts
 */
import { allLegalActions, initialState, perft } from "../src/index.js";

const s0 = initialState();
const moves = allLegalActions(s0).filter((a) => a.kind === "move").length;
console.log(`depth 1 (moves only)      : ${moves}`);
for (const depth of [1, 2]) {
  const t = process.hrtime.bigint();
  const n = perft(s0, depth);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`depth ${depth} (moves + 한수쉼) : ${n}  (${ms.toFixed(0)} ms)`);
}
