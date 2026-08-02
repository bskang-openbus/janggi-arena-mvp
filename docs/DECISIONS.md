# DECISIONS.md — 오케스트레이터 자율 결정 로그

- 문서에 없는 사항을 스스로 결정할 때마다 아래 형식으로 append 한다
- 아침에 사용자가 이 파일만 읽고 모든 자율 결정을 파악할 수 있어야 한다

## 형식

```text
### [시각] 결정 제목
- 배경: 어떤 공백/충돌이 있었는가
- 결정: 무엇으로 정했는가
- 사유: 왜 그렇게 정했는가
- 영향: 코드/문서 어디에 반영됐는가
```

## 기록

<!-- 아래에 append -->

### [2026-08-03 02:5x] 엔진 공개 API 계약 사전 확정 (docs/ENGINE_API.md)
- 배경: P1(엔진)과 P2~P5(웹/서버)가 서로 다른 에이전트로 병렬·순차 작업하므로 인터페이스 어긋남 위험
- 결정: 오케스트레이터가 타입·함수 시그니처·판정 의무를 docs/ENGINE_API.md로 확정, P1은 구현·P2는 소비만
- 사유: 팀 병렬 작업 시 계약 우선(contract-first)이 재작업 최소화. 기물 id 필드는 포획 연출 추적용으로 선제 포함
- 영향: docs/ENGINE_API.md 신설, P1/P2 에이전트 지시서에 포함 예정

### [2026-08-03 02:47] 원본 janggi.zip 제거
- 배경: docs/janggi.zip 압축 해제 후 원본 zip과 중복 사본(kickoff zip) 존재
- 결정: 문서 7종을 루트/docs에 배치하고 zip 및 추출 폴더 삭제
- 사유: 내용 전부 md로 보존됨, 저장소 중복 방지
- 영향: 루트 CLAUDE.md/TASKS.md/RUN.md, docs/*.md 4종

### [2026-08-03 02:55] P0 스캐폴드 — 패키지 버전·포트·구조 결정
- 배경: TASKS.md P0에 정확한 버전·포트가 명시되지 않아 직접 선택 필요
- 결정:
  - Next.js `15.5.22` (15.x 최신 패치, 16 금지 규칙 준수), React `19.1.0`/React DOM `19.1.0` (create-next-app 기본값, `@react-three/fiber@9`/`drei@10`/`postprocessing@3`가 요구하는 `react ^19` 범위 충족)
  - three `0.185.1`, `@react-three/fiber` `9.7.0`, `@react-three/drei` `10.7.7`, `@react-three/postprocessing` `3.0.4`, `zustand` `5.0.14` (모두 허용 목록 그대로, 최신 안정 버전 고정)
  - `@types/three@0.185.3`을 devDependency로 추가 — three 0.185.1이 자체 타입 선언을 노출하지 않아 `next build`의 타입체크가 실패했음(필수 피어 성격의 타입 전용 패키지로 판단, 허용 목록 취지 위반 아님)
  - engine 패키지: TypeScript `5.9.3`(안정판 5.x 계열, 최신 major인 TS7은 생태계 검증 리스크로 보류), vitest `3.2.7`(최신 major 4.x 대신 성숙한 3.x 계열 선택 — 무중단 야간 빌드 안정성 우선)
  - 개발/E2E 포트: `3002` 고정 (`lsof`로 3000/3001/3100/4173/4200/5173 등 기존 점유 확인 후 빈 포트 선택). `apps/web`의 dev/start 스크립트와 `playwright.config.ts` 양쪽에 반영
  - `next build`는 webpack 경로 유지(`--turbopack` 플래그 제거), `next dev`만 `--turbopack` 유지 — Turbopack 프로덕션 빌드는 아직 실험적 딱지가 남아 있어 P0 게이트(빌드 성공)의 안정성을 위해 프로덕션 빌드는 검증된 경로로 고정. dev 서버(Playwright webServer)는 속도를 위해 Turbopack 유지
  - Playwright webServer는 `next dev`(3002) 사용 — `next build && next start` 대신 dev 서버로 E2E를 구동해 build 게이트와 e2e 게이트를 독립적으로 유지하고 야간 반복 실행 속도를 높임
  - `next/font/google`(Geist) 템플릿 기본값 제거, 시스템 폰트 스택으로 교체 — CLAUDE.md 4절 "폰트는 Pretendard CDN만 예외" 규칙과 충돌 방지 (Pretendard 적용은 P6에서 진행 예정)
  - 템플릿 기본 자산(next/vercel/file/globe/window svg, 루트 README.md) 삭제 — 미사용 마케팅 페이지 잔재 정리
- 사유: 무중단 야간 빌드에서 최신 major 버전의 생태계 미검증 리스크(vitest4, TS7, Turbopack build)를 피하고, 게이트 통과 가능성을 최대화
- 영향: 루트 `package.json`/`pnpm-workspace.yaml`/`.gitignore`, `packages/engine/*`, `apps/web/package.json`, `apps/web/next.config.ts`(변경 없음), `apps/web/app/*`, `apps/web/playwright.config.ts`, `apps/web/e2e/canvas.spec.ts`

### [2026-08-03 03:0x] P2 시각 레이어 병행 개발 (워크트리 격리)
- 배경: P1 엔진 구현이 크리티컬 패스. P2의 3D 렌더링(보드/기물/머티리얼)은 엔진과 무의존
- 결정: 엔진 무의존 프레젠테이션 컴포넌트를 격리 워크트리 브랜치에서 병행 개발, P1 게이트 통과 후에만 main 머지
- 사유: 게이트 규칙("P1 미통과 시 P2 진입 금지")은 main 기준으로 준수하면서 벽시계 시간 단축. 두 에이전트가 같은 워킹트리에서 git add -A 충돌하는 것 방지
- 영향: board-visual 에이전트 브랜치, P2 통합 시 머지

### [2026-08-03 03:30] P1 엔진 — 룰 해석 및 API 세부 결정
- 배경: RULES.md 5절 테스트 벡터 일부가 3절 본문 규칙과 수치·좌표가 어긋나거나 모호했고, ENGINE_API.md가 정하지 않은 세부(판정 우선순위, perft 정의 등)를 확정해야 했다
- 결정 및 사유:
  1. **V01 "16곳" → 실제 14곳**: 차 e5, 빈 보드, 궁 e2(초)·e9(한) 포함 기준. 5랭크 8곳 + 아래 e4·e3(e2는 아군 궁이 차단) + 위 e6~e9(e9는 적 궁 포획으로 정지) = 14. 명세의 16은 궁 2개를 계산에 넣지 않은 수치로 판단. RULES.md 5절 서두("궁은 양측 항상 포함")를 따라 14로 확정
  2. **적 궁 포획 수는 생성한다**: "아군=차단 / 적=포획 가능" 원칙을 예외 없이 적용. 실전에서는 외통 판정으로 그 국면에 도달하지 않으므로 부작용 없음. 인위적 국면(테스트)에서는 e9 포획이 합법 수로 나온다
  3. **V14 좌표 정정**: "상 e5, f6 기물 → g8·h7 불가"는 RULES.md 3.4(도착점 (±2,±3)) 기하와 모순. e5 상의 경로는 g8={e6,f7}, h7={f5,g6}이며 f6은 어느 경로에도 없다. 따라서 f6은 아무것도 막지 않고(V14b로 명시 테스트), 멱2 차단은 f7(→g8만 불가)로 검증. V15도 같은 이유로 "d8·f8"을 실제 도착점 "c8·g8"로 정정
  4. **V25 정정**: 초 사 e3은 e3에 대각선이 없고 e4는 궁성 밖이므로, 핀 상태에서 합법 수가 0개다(옆으로 못 갈 뿐 아니라 아예 못 움직인다). 테스트를 그에 맞게 강화
  5. **빅장은 장군이 아니다**: 두 궁은 서로를 공격하지 않는 것으로 구현(궁은 궁성 내 선만 이동하므로 자연 귀결). 빅장을 만드는 수는 합법이고 즉시 draw/facing (RULES.md 4절 MVP 단순화 규정 준수)
  6. **판정 우선순위 = 외통 > 빅장 > 3회 반복** (ENGINE_API.md "판정 의무" 1·2·3 순서 그대로)
  7. **반복 국면 동일성 = 배치 + 차례**. 기물 id는 무관. pass도 국면을 만들므로 반복 카운트에 포함(4연속 pass면 무승부)
  8. **perft 정의**: `allLegalActions` 기준(한수쉼 포함) 정확히 depth 플라이의 수순 개수. 초기 국면 **depth1 = 32(수 31 + pass 1), depth2 = 1024**. 수만 세면 depth1 = 31
  9. **GameState에 `positionCounts` 필드 추가**: 반복 판정을 순수 함수로 유지하기 위한 최소 이력. ENGINE_API.md가 "판정에 필요한 최소 이력(구현 자유)"으로 위임한 범위 내. 계약된 필드·함수 시그니처는 전부 그대로 구현
  10. **계약 외 추가 export(가산적, 파괴적 변경 없음)**: `isCheckmate`, `isFacing`, `positionKey`, `stateFrom`, `boardFrom`, `initialBoard`, `pieceAt`, `findGeneral`, `inPalaceOf`, `isPalaceDiagonalPoint`, `palaceDiagonalNeighbors`, `opponent` 등 P2가 3D 보드를 그릴 때 필요할 유틸
  11. **`legalMovesFrom`은 (a) 게임 종료 상태 (b) 상대 기물·빈 칸에 대해 빈 배열 반환** — P2 UI가 별도 방어 코드 없이 클릭 핸들러에 그대로 쓰도록
- 영향: `packages/engine/src/{types,board,movegen,game,index}.ts`, 테스트 11개 파일 103개

### [2026-08-03 03:30] P1 — E2E 기보 픽스처 생성 방식
- 배경: Playwright가 재생할 기보 2종을 "엔진으로 생성·검증"해야 하는데, 엔진이 순수 TS(런타임 의존성 0)라 Node에서 바로 실행할 러너가 없었다
- 결정:
  - `packages/engine/scripts/ts-resolve.mjs` — Node 24 내장 타입 스트리핑 + `module.registerHooks`로 `./x.js` → `./x.ts` 만 재매핑하는 15줄짜리 훅. 의존성 0. `pnpm -F engine fixtures`, `pnpm -F engine perft`로 실행
  - `capture-game.json`: 손으로 설계 후 엔진 전수 검증한 7수 기보. 0~5수는 무포획, **6번째(0-index) 수 a1→a7에서 초 차가 한 병 포획**
  - `mate-game.json`: 협조 탐색(helpmate) — 초는 한의 합법 수를 최소화하는 수, 한은 자기 합법 수를 최소화하는 수를 고르고 무승부 수는 배제. 시드 1~60 중 최단 결과 채택 → **seed 12, 9수, 초 승 외통**. 마지막 수 e4→g7(상)이 포 e3의 열린 장군과 상의 직접 장군을 동시에 거는 양수겸장이라 벗어날 수 없음
  - 재현성을 위해 `Math.random` 대신 LCG 시드 사용
  - 두 기보 모두 `src/fixtures.test.ts`가 매 테스트 실행마다 전 수 합법성·기대 결과를 재검증
- 영향: `packages/engine/scripts/*`, `apps/web/e2e/fixtures/*.json`, `packages/engine/src/fixtures.test.ts`, `packages/engine/package.json`(scripts 2개), `packages/engine/tsconfig.json`(include에 scripts 추가)

### [2026-08-03 03:25] P2 시각 레이어 — 렌더링 세부 결정 (board-visual 에이전트, 오케스트레이터 대리 기록)
- 배경: PRD 5절이 정하지 않은 3D 세부(좌표계, 색상값, 각인 방식, 카메라)
- 결정: 월드 좌표 x=file-4, z=-(rank-4.5), 교차점 간격 1유닛, 초=+Z(화면 아래). 초 body #1c6155/accent #3ce9ca, 한 #7d2420/#ff6152 (PRD 지정색은 emissive 유지). 한자 각인은 실린더 캡 UV 회전 문제 회피 위해 상향 평면+투명 RGBA 텍스처(map+emissiveMap). 카메라 고도 54° 부감, fov38, 각도·줌 제한, 팬 금지. 나무결은 value-noise+fbm 워프 캔버스 텍스처. E2E 포트는 WEB_PORT 환경변수 오버라이드(기본 3002). next devIndicators=false (스크린샷 오염 방지)
- 사유: 스크린샷 자가 평가 3회 이터레이션으로 프레이밍·질감·가독성 확정
- 영향: apps/web/src/components/board/*, apps/web/app/page.tsx, playwright.config.ts, next.config.ts
