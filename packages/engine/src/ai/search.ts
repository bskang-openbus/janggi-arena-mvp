/**
 * Alpha-beta / iterative-deepening search for Janggi.
 *
 * Design notes (docs/DECISIONS.md):
 *  - The engine's own immutable API is authoritative at the ROOT: candidate actions come from
 *    allLegalActions(), so the returned action is always legal even if a search heuristic is off.
 *  - Inside the tree the search works directly on a cloned Board with make/unmake plus the
 *    O(1)-ish attack detector (ai/attacks.ts) — applyAction()'s clone + Map copy + positionKey
 *    per node caps the search at ~10k nodes/s, far too slow for depth 3+.
 *  - Janggi specials: 한수쉼(pass) is a real candidate but carries a small penalty; 빅장 and
 *    3회 반복 are drawn, scored -contempt from the root side's view — a winning side avoids
 *    them by itself and a clearly losing side still reaches for them.
 */
import { FILES, cloneBoard, opponent } from "../board.js";
import { allLegalActions, positionKey } from "../game.js";
import { allPseudoLegalMoves } from "../movegen.js";
import type { Action, Board, GameState, Piece, PieceType, Side } from "../types.js";
import { EngineError } from "../types.js";
import { attacked } from "./attacks.js";
import { DRAW, INF, MATE, PIECE_VALUE, evaluate, type EvalWeights } from "./eval.js";
import type { Rng } from "./rng.js";
import type { AiResult } from "./types.js";

/* ------------------------------------------------------------------ zobrist */

const PIECE_INDEX: Record<PieceType, number> = {
  general: 0,
  guard: 1,
  chariot: 2,
  cannon: 3,
  horse: 4,
  elephant: 5,
  soldier: 6,
};

const SQUARES = 90;
const PIECE_KINDS = 14; // 7 types x 2 sides
const Z_LO = new Int32Array(SQUARES * PIECE_KINDS);
const Z_HI = new Int32Array(SQUARES * PIECE_KINDS);
let Z_TURN_LO = 0;
let Z_TURN_HI = 0;

(function initZobrist(): void {
  // Fixed seed → the whole search is reproducible without Math.random.
  let s = 0x1a2b3c4d >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s | 0;
  };
  for (let i = 0; i < Z_LO.length; i++) {
    Z_LO[i] = next();
    Z_HI[i] = next();
  }
  Z_TURN_LO = next();
  Z_TURN_HI = next();
})();

function kindOf(p: Piece): number {
  return (p.side === "cho" ? 0 : 7) + PIECE_INDEX[p.type];
}

/* ---------------------------------------------------------------- ctx / mv */

interface TTEntry {
  depth: number;
  score: number;
  /** 0 = exact, 1 = lower bound (fail high), 2 = upper bound (fail low). */
  flag: number;
  move: number;
}

export interface SearchConfig {
  maxDepth: number;
  timeBudgetMs: number;
  quiescence: boolean;
  useTT: boolean;
  /** > 0 → softmax sampling over the best root moves (초급의 실수 유발). */
  temperature: number;
  /** softmax candidate pool size (상위 후보만); 0 = every root move. */
  topK: number;
  /** Random pick among root moves within this many centi-points of the best. */
  jitter: number;
  passPenalty: number;
  /**
   * 무승부 기피치. 빅장/반복 무승부를 루트 진영 관점에서 -contempt 로 평가하므로
   * "조금 불리한 정도"로는 스스로 무승부를 만들지 않고, 확실히 열세일 때만 택한다.
   */
  contempt: number;
  weights: EvalWeights;
  /** true → node budget instead of wall clock (seed 지정 시 완전 재현). */
  deterministic: boolean;
  nodesPerMs: number;
}

interface Mv {
  fr: number;
  fc: number;
  tr: number;
  tc: number;
  cap: Piece | null;
  pass: boolean;
  ord: number;
}

interface Ctx {
  board: Board;
  lo: number;
  hi: number;
  /** general squares, -1 when absent (fuzz positions may lack one). */
  gcr: number;
  gcc: number;
  ghr: number;
  ghc: number;
  nodes: number;
  deadline: number;
  nodeBudget: number;
  abortEnabled: boolean;
  aborted: boolean;
  seen: Map<number, number>;
  tt: Map<number, TTEntry>;
  useTT: boolean;
  quiescence: boolean;
  passPenalty: number;
  contempt: number;
  rootSide: Side;
  weights: EvalWeights;
  hist: Int32Array;
}

const PASS_CODE = SQUARES * SQUARES + 1;

function encode(m: Mv): number {
  return m.pass ? PASS_CODE : (m.fr * FILES + m.fc) * SQUARES + (m.tr * FILES + m.tc) + 1;
}

/** 53-bit key from the 64-bit zobrist pair (exactly representable as a JS number). */
function hashKey(ctx: Ctx): number {
  return (ctx.hi >>> 1) * 4194304 + (ctx.lo & 0x3fffff);
}

function xorPiece(ctx: Ctx, sq: number, kind: number): void {
  const i = sq * PIECE_KINDS + kind;
  ctx.lo ^= Z_LO[i]!;
  ctx.hi ^= Z_HI[i]!;
}

function createCtx(board: Board, turn: Side, cfg: SearchConfig, startedAt: number): Ctx {
  const ctx: Ctx = {
    board,
    lo: 0,
    hi: 0,
    gcr: -1,
    gcc: -1,
    ghr: -1,
    ghc: -1,
    nodes: 0,
    deadline: cfg.deterministic ? Infinity : startedAt + cfg.timeBudgetMs,
    nodeBudget: cfg.deterministic ? Math.max(64, Math.round(cfg.timeBudgetMs * cfg.nodesPerMs)) : Infinity,
    abortEnabled: false,
    aborted: false,
    seen: new Map(),
    tt: new Map(),
    useTT: cfg.useTT,
    quiescence: cfg.quiescence,
    passPenalty: cfg.passPenalty,
    contempt: cfg.contempt,
    rootSide: turn,
    weights: cfg.weights,
    hist: new Int32Array(SQUARES * SQUARES),
  };
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < FILES; c++) {
      const p = board[r]![c];
      if (!p) continue;
      xorPiece(ctx, r * FILES + c, kindOf(p));
      if (p.type === "general") {
        if (p.side === "cho") {
          ctx.gcr = r;
          ctx.gcc = c;
        } else {
          ctx.ghr = r;
          ctx.ghc = c;
        }
      }
    }
  }
  if (turn === "han") {
    ctx.lo ^= Z_TURN_LO;
    ctx.hi ^= Z_TURN_HI;
  }
  return ctx;
}

/* ------------------------------------------------------------ make / unmake */

function make(ctx: Ctx, m: Mv): void {
  ctx.lo ^= Z_TURN_LO;
  ctx.hi ^= Z_TURN_HI;
  if (m.pass) return;
  const b = ctx.board;
  const piece = b[m.fr]![m.fc]!;
  b[m.fr]![m.fc] = null;
  b[m.tr]![m.tc] = piece;
  const from = m.fr * FILES + m.fc;
  const to = m.tr * FILES + m.tc;
  const kind = kindOf(piece);
  xorPiece(ctx, from, kind);
  xorPiece(ctx, to, kind);
  if (m.cap) {
    xorPiece(ctx, to, kindOf(m.cap));
    if (m.cap.type === "general") {
      if (m.cap.side === "cho") {
        ctx.gcr = -1;
        ctx.gcc = -1;
      } else {
        ctx.ghr = -1;
        ctx.ghc = -1;
      }
    }
  }
  if (piece.type === "general") {
    if (piece.side === "cho") {
      ctx.gcr = m.tr;
      ctx.gcc = m.tc;
    } else {
      ctx.ghr = m.tr;
      ctx.ghc = m.tc;
    }
  }
}

function unmake(ctx: Ctx, m: Mv): void {
  ctx.lo ^= Z_TURN_LO;
  ctx.hi ^= Z_TURN_HI;
  if (m.pass) return;
  const b = ctx.board;
  const piece = b[m.tr]![m.tc]!;
  b[m.fr]![m.fc] = piece;
  b[m.tr]![m.tc] = m.cap;
  const from = m.fr * FILES + m.fc;
  const to = m.tr * FILES + m.tc;
  const kind = kindOf(piece);
  xorPiece(ctx, from, kind);
  xorPiece(ctx, to, kind);
  if (m.cap) {
    xorPiece(ctx, to, kindOf(m.cap));
    if (m.cap.type === "general") {
      if (m.cap.side === "cho") {
        ctx.gcr = m.tr;
        ctx.gcc = m.tc;
      } else {
        ctx.ghr = m.tr;
        ctx.ghc = m.tc;
      }
    }
  }
  if (piece.type === "general") {
    if (piece.side === "cho") {
      ctx.gcr = m.fr;
      ctx.gcc = m.fc;
    } else {
      ctx.ghr = m.fr;
      ctx.ghc = m.fc;
    }
  }
}

/* ------------------------------------------------------- position predicates */

function inCheck(ctx: Ctx, side: Side): boolean {
  const r = side === "cho" ? ctx.gcr : ctx.ghr;
  if (r < 0) return false;
  const c = side === "cho" ? ctx.gcc : ctx.ghc;
  return attacked(ctx.board, r, c, opponent(side));
}

/** 빅장: both generals on one file with nothing between them → 즉시 무승부. */
function facing(ctx: Ctx): boolean {
  if (ctx.gcr < 0 || ctx.ghr < 0 || ctx.gcc !== ctx.ghc) return false;
  const lo = Math.min(ctx.gcr, ctx.ghr);
  const hi = Math.max(ctx.gcr, ctx.ghr);
  const b = ctx.board;
  for (let r = lo + 1; r < hi; r++) if (b[r]![ctx.gcc]) return false;
  return true;
}

/* -------------------------------------------------------- move generation */

function orderOf(ctx: Ctx, piece: Piece, cap: Piece | null, from: number, to: number, check: boolean): number {
  if (cap) return 1_000_000 + PIECE_VALUE[cap.type] * 16 - PIECE_VALUE[piece.type];
  const h = ctx.hist[from * SQUARES + to]!;
  return (check ? 400_000 : 0) + (h > 300_000 ? 300_000 : h);
}

/**
 * Legal moves for `side` (self-check filtered, exactly like the engine's allLegalActions).
 * `capturesOnly` drops quiet moves and the pass (quiescence).
 */
function genLegal(ctx: Ctx, side: Side, capturesOnly: boolean): Mv[] {
  const b = ctx.board;
  const foe = opponent(side);
  const myR = side === "cho" ? ctx.gcr : ctx.ghr;
  const myC = side === "cho" ? ctx.gcc : ctx.ghc;
  const foeR = side === "cho" ? ctx.ghr : ctx.gcr;
  const foeC = side === "cho" ? ctx.ghc : ctx.gcc;
  const out: Mv[] = [];
  for (const mv of allPseudoLegalMoves(b, side)) {
    const fr = mv.from.rank;
    const fc = mv.from.file;
    const tr = mv.to.rank;
    const tc = mv.to.file;
    const cap = b[tr]![tc] ?? null;
    if (capturesOnly && !cap) continue;
    const piece = b[fr]![fc]!;
    b[fr]![fc] = null;
    b[tr]![tc] = piece;
    let gr = myR;
    let gc = myC;
    if (piece.type === "general") {
      gr = tr;
      gc = tc;
    }
    const selfCheck = gr >= 0 && attacked(b, gr, gc, foe);
    let gives = false;
    if (!selfCheck && foeR >= 0 && !(cap && cap.type === "general")) {
      gives = attacked(b, foeR, foeC, side);
    }
    b[fr]![fc] = piece;
    b[tr]![tc] = cap;
    if (selfCheck) continue;
    out.push({
      fr,
      fc,
      tr,
      tc,
      cap,
      pass: false,
      ord: orderOf(ctx, piece, cap, fr * FILES + fc, tr * FILES + tc, gives),
    });
  }
  // 한수쉼: legal unless in check (engine rule).
  if (!capturesOnly && !(myR >= 0 && attacked(b, myR, myC, foe))) {
    out.push({ fr: -1, fc: -1, tr: -1, tc: -1, cap: null, pass: true, ord: -1_000_000 });
  }
  return out;
}

const byOrd = (a: Mv, b: Mv): number => b.ord - a.ord;

/* ------------------------------------------------------------- search core */

function checkAbort(ctx: Ctx): void {
  if (ctx.nodes >= ctx.nodeBudget) {
    ctx.aborted = true;
    return;
  }
  // deterministic mode has deadline = Infinity and never reads the clock.
  if (ctx.deadline !== Infinity && Date.now() >= ctx.deadline) ctx.aborted = true;
}

function bump(ctx: Ctx, key: number, delta: number): void {
  const n = (ctx.seen.get(key) ?? 0) + delta;
  if (n <= 0) ctx.seen.delete(key);
  else ctx.seen.set(key, n);
}

function isRepetition(ctx: Ctx, key: number): boolean {
  return (ctx.seen.get(key) ?? 0) >= 2;
}

/**
 * Draw value seen by `side`. Anchored to the root side so every ancestor of the root's
 * colour reads the same -contempt after negamax's sign flips.
 */
function drawScore(ctx: Ctx, side: Side): number {
  return side === ctx.rootSide ? -ctx.contempt : ctx.contempt;
}

function quiesce(ctx: Ctx, side: Side, alpha: number, beta: number, ply: number, qply: number): number {
  ctx.nodes++;
  if (ctx.abortEnabled && (ctx.nodes & 255) === 0) checkAbort(ctx);
  if (ctx.aborted) return DRAW;

  const chk = inCheck(ctx, side);
  let evasions: Mv[] | null = null;
  if (chk) {
    evasions = genLegal(ctx, side, false);
    if (evasions.length === 0) return -MATE + ply; // 외통
  }
  if (facing(ctx)) return drawScore(ctx, side);

  let best: number;
  let moves: Mv[];
  if (chk && qply < 6 && evasions) {
    best = -INF;
    moves = evasions;
  } else {
    best = evaluate(ctx.board, side, ctx.weights);
    if (best >= beta || qply >= 12) return best;
    if (best > alpha) alpha = best;
    moves = genLegal(ctx, side, true);
    if (moves.length === 0) return best;
  }
  moves.sort(byOrd);

  const foe = opponent(side);
  for (const m of moves) {
    make(ctx, m);
    const v = -quiesce(ctx, foe, -beta, -alpha, ply + 1, qply + 1);
    unmake(ctx, m);
    if (ctx.aborted) return best > -INF ? best : DRAW;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function leaf(ctx: Ctx, side: Side, alpha: number, beta: number, ply: number): number {
  // 판정 순서는 엔진과 동일: 외통 → 빅장 → 반복.
  if (inCheck(ctx, side) && genLegal(ctx, side, false).length === 0) return -MATE + ply;
  if (facing(ctx)) return drawScore(ctx, side);
  if (isRepetition(ctx, hashKey(ctx))) return drawScore(ctx, side);
  if (ctx.quiescence) return quiesce(ctx, side, alpha, beta, ply, 0);
  return evaluate(ctx.board, side, ctx.weights);
}

function negamax(ctx: Ctx, side: Side, depth: number, alpha: number, beta: number, ply: number): number {
  ctx.nodes++;
  if (ctx.abortEnabled && (ctx.nodes & 255) === 0) checkAbort(ctx);
  if (ctx.aborted) return DRAW;
  if (depth <= 0) return leaf(ctx, side, alpha, beta, ply);

  const key = hashKey(ctx);
  let ttMove = 0;
  if (ctx.useTT) {
    const e = ctx.tt.get(key);
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        if (e.flag === 0) return e.score;
        if (e.flag === 1 && e.score >= beta) return e.score;
        if (e.flag === 2 && e.score <= alpha) return e.score;
      }
    }
  }

  const moves = genLegal(ctx, side, false);
  if (moves.length === 0) return -MATE + ply; // 장군 + 합법수 0
  if (facing(ctx)) return drawScore(ctx, side);
  if (isRepetition(ctx, key)) return drawScore(ctx, side);

  if (ttMove !== 0) {
    for (const m of moves) {
      if (encode(m) === ttMove) {
        m.ord = 2_000_000;
        break;
      }
    }
  }
  moves.sort(byOrd);

  const foe = opponent(side);
  const alpha0 = alpha;
  let best = -INF;
  let bestMove = 0;
  for (const m of moves) {
    make(ctx, m);
    const ck = hashKey(ctx);
    bump(ctx, ck, 1);
    let v = -negamax(ctx, foe, depth - 1, -beta, -alpha, ply + 1);
    bump(ctx, ck, -1);
    unmake(ctx, m);
    if (ctx.aborted) return best > -INF ? best : DRAW;
    if (m.pass) v -= ctx.passPenalty;
    if (v > best) {
      best = v;
      bestMove = encode(m);
    }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!m.cap && !m.pass) {
        const i = (m.fr * FILES + m.fc) * SQUARES + (m.tr * FILES + m.tc);
        ctx.hist[i] = ctx.hist[i]! + depth * depth;
      }
      break;
    }
  }

  if (ctx.useTT && !ctx.aborted) {
    if (ctx.tt.size > 400_000) ctx.tt.clear();
    ctx.tt.set(key, {
      depth,
      score: best,
      flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0,
      move: bestMove,
    });
  }
  return best;
}

/* ------------------------------------------------------------- root search */

function toMv(ctx: Ctx, a: Action): Mv {
  if (a.kind === "pass") {
    return { fr: -1, fc: -1, tr: -1, tc: -1, cap: null, pass: true, ord: -1_000_000 };
  }
  const { from, to } = a.move;
  const cap = ctx.board[to.rank]![to.file] ?? null;
  const piece = ctx.board[from.rank]![from.file]!;
  return {
    fr: from.rank,
    fc: from.file,
    tr: to.rank,
    tc: to.file,
    cap,
    pass: false,
    ord: cap ? 1_000_000 + PIECE_VALUE[cap.type] * 16 - PIECE_VALUE[piece.type] : 0,
  };
}

/**
 * Softmax over the `topK` best root moves. Restricting the pool keeps 초급 from playing
 * outright garbage while the temperature still produces genuine mistakes.
 */
function softmaxPick(scores: number[], temperature: number, topK: number, rng: Rng): number {
  const pool = scores
    .map((s, i) => i)
    .filter((i) => scores[i]! > -INF)
    .sort((a, b) => scores[b]! - scores[a]!);
  if (pool.length === 0) return 0;
  const cut = topK > 0 ? pool.slice(0, topK) : pool;
  const max = scores[cut[0]!]!;
  const weights = cut.map((i) => Math.exp((scores[i]! - max) / temperature));
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0)) return cut[0]!;
  let x = rng() * total;
  for (let k = 0; k < cut.length; k++) {
    x -= weights[k]!;
    if (x <= 0) return cut[k]!;
  }
  return cut[0]!;
}

export function searchRoot(state: GameState, cfg: SearchConfig, rng: Rng): AiResult {
  const startedAt = Date.now();
  const rootActions = allLegalActions(state);
  if (rootActions.length === 0) {
    throw new EngineError("chooseAiAction: 합법 액션이 없는 국면 (이미 종료된 대국)");
  }

  const ctx = createCtx(cloneBoard(state.board), state.turn, cfg, startedAt);
  const rootKey = hashKey(ctx);
  ctx.seen.set(rootKey, state.positionCounts.get(positionKey(state.board, state.turn)) ?? 1);

  const side = state.turn;
  const foe = opponent(side);
  const mvs = rootActions.map((a) => toMv(ctx, a));
  const n = mvs.length;
  const order = mvs.map((_, i) => i).sort((a, b) => mvs[b]!.ord - mvs[a]!.ord);
  const fullWindow = cfg.temperature > 0;

  let scores = new Array<number>(n).fill(-INF);
  let completedDepth = 0;

  for (let d = 1; d <= cfg.maxDepth; d++) {
    ctx.abortEnabled = d > 1;
    if (d > 1) {
      const spentEnough = cfg.deterministic
        ? ctx.nodes >= ctx.nodeBudget * 0.45
        : Date.now() - startedAt >= cfg.timeBudgetMs * 0.45;
      if (spentEnough) break;
    }
    const iter = new Array<number>(n).fill(-INF);
    let alpha = -INF;
    let finished = true;
    for (const i of order) {
      const m = mvs[i]!;
      make(ctx, m);
      const ck = hashKey(ctx);
      bump(ctx, ck, 1);
      const searchAlpha = fullWindow || alpha === -INF ? -INF : alpha - cfg.jitter;
      let v = -negamax(ctx, foe, d - 1, -INF, -searchAlpha, 1);
      bump(ctx, ck, -1);
      unmake(ctx, m);
      if (ctx.aborted) {
        finished = false;
        break;
      }
      if (m.pass) v -= cfg.passPenalty;
      iter[i] = v;
      if (v > alpha) alpha = v;
    }
    if (!finished) break;
    scores = iter;
    completedDepth = d;
    order.sort((a, b) => scores[b]! - scores[a]!);
    if (alpha >= MATE - 1000 || alpha <= -MATE + 1000) break; // 결판난 수순
  }

  let bestIdx: number;
  if (fullWindow) {
    bestIdx = softmaxPick(scores, cfg.temperature, cfg.topK, rng);
  } else {
    let best = -INF;
    for (const s of scores) if (s > best) best = s;
    const cands: number[] = [];
    for (let i = 0; i < n; i++) if (scores[i]! > -INF && scores[i]! >= best - cfg.jitter) cands.push(i);
    bestIdx = cands.length > 0 ? cands[Math.floor(rng() * cands.length)]! : 0;
  }

  return {
    action: rootActions[bestIdx]!,
    score: scores[bestIdx]! <= -INF ? 0 : scores[bestIdx]!,
    depth: completedDepth,
    nodes: ctx.nodes,
    elapsedMs: Date.now() - startedAt,
  };
}
