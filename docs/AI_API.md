# AI_API.md — 컴퓨터 대국 AI 계약 (오케스트레이터 확정)

- packages/engine에 추가되는 AI 탐색 모듈과 apps/web 소비자 간의 계약.
- 웹은 이 시그니처만 import 한다 (Web Worker 내부에서 호출).

## 타입·함수 (engine에서 export)

```ts
export type AiLevel = 1 | 2 | 3;              // 1=초급, 2=중급, 3=고급
export interface AiOptions {
  level: AiLevel;
  seed?: number;                              // 지정 시 완전 재현 (E2E용). 미지정 시 비결정
  timeBudgetMs?: number;                      // 레벨별 기본값 존재 (고급 ≈ 1200ms 내외)
}
export interface AiResult {
  action: Action;                             // 반드시 합법 (필요 시 pass 포함)
  score: number;                              // 두는 쪽(side-to-move) 관점 평가치
  depth: number;                              // 실제 도달 탐색 깊이
  nodes: number;                              // 탐색 노드 수
  elapsedMs: number;
}
export function chooseAiAction(state: GameState, opts: AiOptions): AiResult;
```

## 난이도 설계 방향 (세부 캘리브레이션은 구현 담당 자유, DECISIONS 기록)

- **초급(1)**: 얕은 탐색(깊이 1 수준) + 상위 후보 무작위성. 초보 인간이 이길 수 있어야 함
- **중급(2)**: 알파베타 깊이 2~3 + 물량/기초 위치 평가. 평범한 유저와 접전
- **고급(3)**: 반복 심화 + 알파베타 + 수순 정렬 + 포획 정적 탐색(quiescence), 시간 예산 기반
- 평가 기초: 대한장기협회 통용 기물 점수 (차13 포7 마5 상3 사3 졸병2) + 기동력/졸 전진 소량 가중
- pass는 탐색에 포함하되 무의미한 pass 남발 방지 페널티
- 빅장=즉시 무승부(엔진 규칙)이므로 우세 시 빅장 회피, 열세 시 선호는 평가에서 자연 유도 (draw=0점)

## 필수 검증 (engine vitest)

1. 합법성 퍼즈: 무작위 국면 다수에서 chooseAiAction 반환 액션이 항상 isLegal
2. seed 재현성: 같은 seed → 같은 수
3. 실력 서열: 고급 vs 초급 자가 대국(축소 시간 예산) 승+무 ≥ 8/10
4. 외통 1수 국면에서 고급이 외통 수 선택, 자살수 회피
5. 시간 예산 준수 (여유 마진 포함)

## 웹 소비 규약

- Web Worker에서 호출 (UI 스레드 블로킹 금지). engine 의존은 워커 파일 1곳에 격리
- store mode: 'local' | 'online' | 'ai'. AI 차례에 입력 잠금 + "생각 중" 표시
- AI의 수도 동일한 포획 연출/사운드 경로를 탄다
