/**
 * Deterministic RNG for the AI. The engine never calls Math.random directly so that a
 * seeded search is byte-for-byte reproducible (docs/AI_API.md, E2E requirement).
 */
export type Rng = () => number;

/**
 * Numerical Recipes LCG with a scrambled seed.
 * The scramble matters: a raw LCG fed 0,1,2,… produces almost identical first outputs, so
 * `seed`s that differ by 1 would pick the same move (E2E는 seed를 순번으로 주기 쉽다).
 */
export function makeRng(seed: number): Rng {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
  s = Math.imul(s ^ (s >>> 12), 0x297a2d39) >>> 0;
  s = (s ^ (s >>> 15)) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let counter = 0;

/** Seed source for unseeded (non-reproducible) calls. Avoids Math.random by design. */
export function autoSeed(): number {
  counter = (counter + 0x9e3779b9) >>> 0;
  return (Date.now() ^ counter) >>> 0;
}
