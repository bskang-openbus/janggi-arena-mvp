# ENGINE_API.md — packages/engine 공개 인터페이스 계약 (오케스트레이터 확정)

- 본 문서는 P1(엔진 구현)과 P2~P5(웹/서버 소비자) 간의 계약이다. P1 담당은 이 시그니처를 구현하고, 소비자는 이것만 import 한다.
- 내부 구현 구조는 P1 담당 자유. 단 공개 API 시그니처 변경 시 반드시 DECISIONS.md에 기록.

## 좌표계

- RULES.md 1절과 동일: 파일 `a`~`i`(0~8), 랭크 `1`~`10`(0~9). 초가 아래(랭크 인덱스 0~3 궁성 측).
- 내부 표현: `Square = { file: number; rank: number }` (0-indexed). 문자열 표기 유틸 제공: `toNotation({file:4,rank:1}) === 'e2'`, `parseNotation('e2')`.

## 타입

```ts
export type Side = 'cho' | 'han';                    // 초(선수) / 한
export type PieceType =
  | 'general'   // 궁 (楚王/漢王)
  | 'guard'     // 사 (士)
  | 'chariot'   // 차 (車)
  | 'cannon'    // 포 (包)
  | 'horse'     // 마 (馬)
  | 'elephant'  // 상 (象)
  | 'soldier';  // 졸(초 卒) / 병(한 兵)

export interface Piece { side: Side; type: PieceType; id: string; } // id는 초기배치 기준 고유 (연출 추적용)
export interface Square { file: number; rank: number; }             // file 0..8, rank 0..9

export type Board = (Piece | null)[][];  // board[rank][file], rank 0 = 초 쪽 랭크1

export interface Move { from: Square; to: Square; }                 // 일반 수
export type Action = { kind: 'move'; move: Move } | { kind: 'pass' };

export type GameResult =
  | { type: 'checkmate'; winner: Side }
  | { type: 'draw'; reason: 'facing' | 'repetition' };              // 빅장 / 3회 반복

export interface GameState {
  board: Board;
  turn: Side;
  // 아래는 판정에 필요한 최소 이력 (구현 자유, 불변 유지)
  readonly history: ReadonlyArray<AppliedAction>;
  result: GameResult | null;   // null = 진행 중
}

export interface AppliedAction {
  action: Action;
  captured: Piece | null;      // 포획 발생 시 잡힌 기물 (연출 트리거용)
  check: boolean;              // 이 수 이후 상대가 장군 상태인가
  notation: string;            // 예: "e2e3", pass는 "pass"
}
```

## 함수 (전부 순수 함수, state 불변)

```ts
export function initialState(): GameState;
export function legalMovesFrom(state: GameState, from: Square): Square[]; // 해당 기물의 합법 도착점 (자살수 필터 적용)
export function allLegalActions(state: GameState): Action[];              // pass 포함 (장군 시 pass 제외)
export function applyAction(state: GameState, action: Action): GameState; // 비합법이면 throw EngineError
export function isCheck(state: GameState, side: Side): boolean;           // side의 궁이 공격당하는 중인가
export function isLegal(state: GameState, action: Action): boolean;
export function toNotation(sq: Square): string;
export function parseNotation(s: string): Square;
export function perft(state: GameState, depth: number): number;           // 자가 검증용
```

## 판정 의무 (applyAction 내부에서 처리)

1. 수 적용 → 상대 외통이면 `result = checkmate`.
2. 두 궁 대면(같은 파일, 사이 빈 칸) 발생 즉시 `result = draw/facing`.
3. 동일 국면(배치+차례) 3회째 도달 즉시 `result = draw/repetition`.
4. `result !== null` 상태에서 applyAction 호출 시 throw.
5. pass: 장군 상태면 throw. 아니면 차례만 전환 (반복 판정에는 국면 동일성 규칙 그대로 적용).

## 소비자 사용 예 (P2 참조)

```ts
const s0 = initialState();
const dests = legalMovesFrom(s0, parseNotation('a4'));      // 초 졸
const s1 = applyAction(s0, { kind: 'move', move: { from: parseNotation('a4'), to: parseNotation('a5') } });
const last = s1.history[s1.history.length - 1];
if (last.captured) { /* 포획 연출 트리거: last.captured.type/side, move.to 위치 */ }
if (s1.result) { /* 결과 오버레이 */ }
```
