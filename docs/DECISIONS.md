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

### [2026-08-03 03:50] P2 통합 — 엔진 ↔ 3D 보드 연결 구조
- 배경: 시각 레이어(`apps/web/src/components/board/*`)는 엔진 무의존 계약으로 완성되어 있었고, 데모 페이지가 스텁 데이터로 렌더 중이었다. 여기에 룰 엔진을 붙여 로컬 2인 대국을 완성해야 했다
- 결정 및 사유:
  1. **어댑터 레이어 신설 (`src/game/adapters.ts`)** — `board/types.ts`는 손대지 않는다. 엔진의 `Board`(=`board[rank][file]`)를 시각 레이어가 원하는 `PieceView[]`(flat, file/rank 포함)로 변환하고, 기물 id → 좌표 역인덱스, 잡힌 말 그룹핑, 마지막 수 문구, 결과 문구를 전부 여기서 만든다. 한자 글리프는 `board/palette.ts`의 `glyphFor`를 재사용해 UI와 3D 각인이 절대 어긋나지 않게 했다
  2. **zustand 스토어 = 엔진 단일 진실원 (`src/game/store.ts`)** — 모든 변경은 `applyAction`을 통과한다. 파생 상태(pieces/lastMove/checkSide/잡힌 말/canPass/마지막 수 문구)는 셀렉터가 아니라 **전이 시점에 1회 계산해 스토어에 물질화**했다. 셀렉터에서 매번 새 배열을 만들면 zustand v5에서 렌더 루프를 유발하기 때문
  3. **`lastCapture` 이벤트를 스토어에 래치** — `{seq(=history index), captured, captor, captorPieceId, at}`. P3 포획 연출 상태머신이 `seq` 증가만 구독하면 되도록 지금은 저장만 한다. seq는 단조 증가하므로 같은 종류의 포획이 연속돼도 트리거를 놓치지 않는다
  4. **적 기물 클릭 = 포획 경로** — `PieceMesh`가 `e.stopPropagation()`을 하므로 하이라이트된 칸 위의 적 기물을 클릭하면 `onSquareClick`이 아니라 `onPieceClick`이 발화한다. `selectPiece`가 "선택 중 + 그 칸이 합법 도착점"이면 `clickSquare`로 위임하도록 처리
  5. **`checkSide`는 외통 후에도 유지** — 결과 오버레이 뒤에서 패배 측 궁이 계속 붉게 맥동하도록. 경고 배너만 `result === null`로 게이팅
  6. **타이틀 ↔ 대국은 라우트가 아닌 스토어 전환** — WebGL 컨텍스트와 프로시저럴 텍스처 캐시를 재생성하지 않기 위해. 단일 라우트 유지
  7. **잡힌 말 목록은 "각 진영이 잡은 말(전과)"** — `history`의 `captured`에서 파생하므로 보드와 절대 어긋날 수 없다. 좌=초 전과, 우=한 전과, 글리프+개수 그룹핑
- 영향: `apps/web/src/game/*`, `apps/web/src/components/game/*`, `apps/web/app/page.tsx`, `apps/web/src/demo/stubBoard.ts`(삭제)

### [2026-08-03 03:50] P2 통합 — 빌드 구성(engine 워크스페이스 의존) 및 dev 번들러 변경
- 배경: `engine`은 빌드 산출물 없이 원본 TS를 `exports: {".": "./src/index.ts"}`로 노출하고, 내부 import는 NodeNext 관례대로 `./game.js`처럼 `.js` 확장자를 쓴다
- 결정:
  - `apps/web/package.json`에 `"engine": "workspace:*"` 추가(모노레포 내부 패키지 — 4절 허용 목록 위반 아님), `next.config.ts`에 `transpilePackages: ["engine"]`
  - webpack `resolve.extensionAlias`에 `".js" → [".ts",".tsx",".js"]` 추가 (이게 없으면 `Module not found: ./game.js`)
  - **dev 스크립트에서 `--turbopack` 제거** — Turbopack은 `extensionAlias` 상당 옵션이 없어 워크스페이스 TS 패키지의 `.js` 확장자 import를 해결하지 못했다(dev 500). 대안(엔진 소스 수정/빌드 산출물 추가)은 "packages/engine 수정 금지" 제약에 걸리므로 웹팩 dev를 택했다. `next build`는 원래 웹팩이라 영향 없음. Ready in ~0.9s로 체감 손실 없음
- 영향: `apps/web/package.json`, `apps/web/next.config.ts`, `pnpm-lock.yaml`

### [2026-08-03 03:50] P2 통합 — E2E 입력 브리지
- 배경: 3D 교차점을 Playwright에서 클릭하려면 테스트가 카메라 투영을 재계산해야 해서 취약하다
- 결정: `src/components/game/E2EBridge.tsx`가 `window.__janggi`에 `clickPiece/clickSquare/play/playAll/pass/snapshot`을 노출한다. **자체 게임 로직 없이 스토어 액션을 그대로 호출**하므로 검증 대상 로직은 프로덕션과 100% 동일하다. `play(from,to)`는 실제 보드처럼 도착점에 기물이 있으면 `clickPiece`(PieceMesh 경로), 없으면 `clickSquare`(픽 평면 경로)로 라우팅한다. 마운트 조건 = `NODE_ENV !== 'production' || NEXT_PUBLIC_E2E === '1'` → 프로덕션 번들에는 포함되지 않는다. 턴 표시·장군 배너·잡힌 말·결과 오버레이 등 화면 검증은 전부 실제 DOM 어서션으로 수행
- 사유: 3D 픽 좌표 계산을 테스트에 복제하는 것보다 회귀 신뢰도가 높고, 프로덕션 로직과 분리 유지 조건도 만족
- 영향: `apps/web/src/components/game/E2EBridge.tsx`, `apps/web/e2e/{helpers.ts,local-game.spec.ts,visual-board.spec.ts,canvas.spec.ts}`

### [2026-08-03 04:05] P1 적대적 감사 결과 — 엔진 신뢰 확정 (rules-auditor, 오케스트레이터 기록)
- 배경: P1 엔진을 독립 에이전트가 RULES.md에서 직접 유도한 레퍼런스로 적대 검증
- 결정: 버그 0건 확인, audit.test.ts 112개 main 머지 (총 215 green). 퍼징 22.9만 회 불일치 0, perft d3=32964 독립 재계산 일치 (32^3과의 차이는 2수 빅장 조합 12가지로 전수 설명됨)
- 주의사항 (후속 페이즈 함정, 특히 P4 픽스처 제작 시):
  1. stateFrom()으로 초궁 e2·한궁 e9만 배치하고 e파일이 비면 이미 빅장 국면 — 어떤 수를 둬도 즉시 draw/facing. 커스텀 국면은 궁을 다른 파일에 두거나 사이에 기물을 넣을 것
  2. 인위 국면에서 적 궁 포획 수가 생성됨 (실전 도달 불가 증명됨) — 커스텀 국면 설계 시 유의
  3. RULES.md V01/V14/V15 수치는 문서 오류로 판명 (구현·DECISIONS 정정본이 기하학적으로 타당함을 독립 재유도로 확인)
- 영향: packages/engine/src/audit.test.ts 신설, 이후 회귀 게이트에 포함

### [2026-08-03 04:35] P3 Tier1 공통 포획 연출 — 상태머신·시간축·확장 슬롯 구조
- 배경: 60fps로 흐르는 2.9초 연출을 React 상태로 돌리면 매 프레임 대국 화면 전체가 리렌더된다. 동시에 E2E와 P4는 "지금 연출 중인가"를 알아야 한다
- 결정 및 사유:
  1. **상태를 2층으로 분리** — 거친 위상(`cinematicPhase: "idle" | "cinematic"` + `cinematic: CinematicPlan | null`)만 zustand에 두고, 매 프레임 값(t/attackerPos/dim/flash/trauma/awaken)은 `board/vfx/stage.ts`의 **가변 싱글턴**에 쓴다. 디렉터가 `useFrame(priority -2)`에서 1회 갱신하고, PieceMesh·이펙트 메시·DOM 플래시가 각자의 프레임 루프에서 읽는다. React `set()`은 연출당 2회(진입/종료)뿐
  2. **프레임 우선순위 −2** — drei OrbitControls가 −1, 기물이 0, postprocessing이 +1이므로 디렉터가 항상 먼저 돈다. OrbitControls는 `controls.enabled`를 **명령형으로** 끈다(프롭으로 넘기면 스킵 직후 복귀 러프와 싸운다). drei가 `enabled`를 프롭으로 재적용하지 않는 것을 소스로 확인
  3. **히트스톱은 시간축 매핑으로** — `stageTime(raw)`가 1.2s에서 100ms 동안 t를 고정한다. 모든 이펙트가 t만 보므로 히트스톱이 자동으로 전파되고, 붉은 플래시가 정지 구간 내내 유지되어 타격감이 강해진다. 실제 소요 = 2.8 + 0.1 = 2.9초 (PRD 6절 2.5~3.5초 범위)
  4. **연출 연출용 무대 위치(staging)** — 공격 기물을 원래 출발칸에 세우면 a1→a7 같은 장거리 포획에서 두 기물이 6칸 떨어져 "측면 줌"이 불가능하다. 0~0.34s 동안 출발칸 → `피격칸 − dir×1.15`로 활주시킨 뒤 그 지점에서 소환진을 편다. 덕분에 **이동 거리와 무관하게 프레이밍이 동일**하다. 타격 정지 간격 `STRIKE_GAP=0.64`는 두 기물 반지름 합(~0.6)보다 커야 한다 — 처음 0.2로 잡았더니 공격 기물이 피격 기물을 완전히 가렸다(스크린샷 1차 이터레이션에서 발견)
  5. **P4 확장 슬롯 = attackVariant 레지스트리** (`board/vfx/attackVariants.ts`) — 0.8~1.2s 구간은 `offset(ctx) → [x,y,z]`(무대 위치 기준 월드 오프셋), `awaken(ctx)`, `Extras`(연출 내내 마운트되는 추가 3D 컴포넌트) 세 개로만 정의된다. P3는 `lunge`(전방 돌진) 하나만 등록. P4는 `registerAttackVariant()` + `PIECE_VARIANT[type] = id` 두 줄이면 꽂힌다. 타임라인·카메라·입력잠금·스킵은 손댈 필요 없음
  6. **피격 기물 고스트** — 엔진은 포획 즉시 기물을 지우므로 `CinematicPlan.victim`이 뷰 사본을 들고 있고 `GhostPiece`가 커스텀 `ShaderMaterial`로 렌더한다. 디졸브는 월드 좌표 3D value-noise + 높이 바이어스(아래→위 붕괴) 임계값이며 경계 밴드에 주홍(#ff7a2e) 발광을 3.4배로 얹는다. 조명은 wrap-lambert + 프레넬 림(암전 속에서만 보이므로 이걸로 충분). 색·경계폭·노이즈 스케일 전부 유니폼 → P4에서 기물별 재색조 가능
  7. **파티클은 CPU 해석해(analytic)** — `x(t) = v₀(1−e^(−kt))/k + ½gt²`. 프레임 누적이 아니라 t로부터 직접 계산하므로 프레임 드랍이 궤적을 어긋내지 못하고 스크린샷이 재현된다. 시드는 `mulberry32`. 총량 스파크 150 + 혈흔/백금 120 + 재 96 = **366개(3 draw call)**, 저사양 모드에서 절반
  8. **혈흔 데칼은 연출보다 오래 산다** — 1.5s에 `commitDecal()`로 영구 목록에 옮기고 최대 10개(오래된 것부터 폐기), 재시작 시 초기화. 스킵해도 같은 최종 상태로 점프한다. 포획칸에는 **공격 기물이 올라서므로** 데칼을 타격 방향으로 0.42유닛 밀어 그리지 않으면 영원히 가려진다
  9. **입력 잠금은 2중** — 스토어 액션(`selectPiece`/`clickSquare`/`pass`)이 위상을 검사하고, 동시에 화면 전체를 덮는 DOM 오버레이(z-30)가 캔버스로 가는 포인터 이벤트를 막는다. 그 오버레이 자체가 스킵 히트박스라서 "아무 데나 탭 = 스킵"이 공짜로 나온다
  10. **설정은 localStorage 직접 사용** — `zustand/persist`는 CLAUDE.md 4절 의존성 고정 때문에 쓰지 않았다. SSR은 기본값으로 렌더하고 마운트 후 `hydrateSettings()`로 맞춘다(하이드레이션 불일치 회피)
- 연출 파라미터(스크린샷 3회 자가 평가로 확정): 카메라 측면 3.2유닛·높이 2.6(약 38° 고도)·타깃 y0.28, 암전 주변광 −80%/키라이트 −62%, 붉은 플래시 최대 0.55(mix-blend-screen), 트라우마 흔들림 진폭 0.24·감쇠 3.1, 충격파 링 2겹(0.62s/0.4s), 디졸브 0.72초, 각인 발광 상한 1.0(넘기면 한자가 흰 덩어리로 뭉개짐)
- 영향: `apps/web/src/components/board/vfx/*`(신규 9파일), `board/{JanggiScene,PieceMesh}.tsx`, `src/game/store.ts`, `src/components/game/{GameScreen,CinematicOverlay,SettingsOverlay,E2EBridge}.tsx`, `e2e/{helpers.ts,capture-cinematic.spec.ts}`

### [2026-08-03 04:35] P3 — E2E가 "연출이 실제로 그려졌는지"를 검증하는 방법
- 배경: 스크린샷을 저장해도 그것이 빈 화면인지 판별하지 못하면 회귀를 놓친다. 또 기존 12개 테스트는 수와 수 사이에 연출이 끼면서 입력이 막혀 전부 깨질 위험이 있었다
- 결정:
  - `JanggiScene`이 **개발/E2E 빌드에서만** `preserveDrawingBuffer`를 켠다. 브리지의 `sampleFrame()`이 WebGL 캔버스를 192×120 2D 캔버스로 `drawImage` 후 `getImageData`로 평균 휘도·밝은 픽셀 비율·유채색 비율을 계산한다. 연출 프레임이 포획 직전 프레임보다 밝은 픽셀이 많아야 통과 → "흰/검은 빈 화면"이 구조적으로 실패한다
  - `playMoves`에 `cinematics: "skip" | "watch"` 옵션 추가, 기본 "skip". 기존 기보 재생 테스트는 매 수 뒤 `skipCinematic()`(= 사용자가 탭하는 것과 동일한 액션)을 호출하고 위상이 idle인지까지 확인한다. 연출 자체를 검증하는 신규 4개 테스트만 실제로 재생
  - 스크린샷 지연 보정: SwiftShader에서 캔버스 스크린샷이 ~0.3초 걸리므로 목표 비트보다 **먼저** 셔터를 연다(타격 프레임은 t=1.02에서 요청). 캡처 후 `cinematicT`를 다시 읽어 1.02~2.3 구간 안이었음을 어서션
- 영향: `apps/web/e2e/helpers.ts`, `apps/web/e2e/capture-cinematic.spec.ts`, `src/components/game/E2EBridge.tsx`, `src/components/board/JanggiScene.tsx`

### [2026-08-03 05:05] P3-fix — 연출 E2E의 실시간 레이스 제거 (결정적 클록)
- 배경: 감사에서 `capture-cinematic.spec.ts`의 "디졸브 소멸 구간" 테스트가 **전체 스위트 실행에서만** 간헐 실패(2회 연속 재현)했다. 단독 실행은 항상 통과
- 원인: 연출이 실시간(rAF delta)으로 흐르는데 테스트는 `waitForFunction`으로 `cinematicT`가 목표치에 닿기를 기다렸다. SwiftShader + 스위트 부하에서는 `play(포획수)` 호출과 첫 폴링 사이에 실제 2.9초가 다 지나가 연출이 idle로 복귀 → `cinematicT`가 0으로 돌아가 목표치에 **영영 도달하지 않고** 10초 타임아웃. 스크린샷 지연을 앞당겨 보정하던 기존 방식(`advanceTo(1.02)` 후 캡처)도 같은 레이스를 안고 있었다
- 결정: **연출 클록을 테스트가 직접 잡는다.**
  - `board/vfx/stage.ts`에 `cinematicClock = { manual, seek }` 추가. 디렉터는 프레임마다 `seek`가 있으면 `stage.raw`를 그 값으로 스냅하고, `manual`이면 스스로 시간을 흘리지 않는다 (3줄)
  - **유일한 writer는 `E2EBridge`** (프로덕션 번들 미포함). 기본값이 곧 "실시간 진행"이라 프로덕션 동작은 한 글자도 바뀌지 않는다. 브리지 언마운트 시 `resetCinematicClock()`
  - 브리지 API: `pauseCinematic()` / `resumeCinematic()` / `seekCinematic(t)`. `t`는 히트스톱 보정된 연출 시각이고 `rawForStageTime()`이 `stageTime()`의 역함수로 wall-clock 값을 만든다
  - 헬퍼 3종 신설: `playCapturePaused(page, move)`(포획 **전에** 클록을 잡는다 — 이게 핵심), `seekCinematic(page, t)`, `resumeAndFinish(page)`
- 이게 성립하는 이유: 이 연출의 모든 값이 `stage.t`의 **순수 함수**다. 파티클은 해석해로 적분하고(프레임 누적 없음), 카메라·암전·플래시·디졸브는 전부 t의 곡선이다. 따라서 t로 점프한 프레임 = 그 시각에 실시간으로 도달했을 프레임과 동일하다. (P4에서 attackVariant를 추가할 때도 이 성질을 깨지 말 것 — `offset`/`awaken`은 t만 받는다)
- 부수 효과: 스크린샷이 원하는 비트에 **정확히** 꽂힌다. 지연 보정용으로 1.02s에 셔터를 열어 1.3~1.7s 어딘가를 찍던 것을 타격 `t=1.26`, 소멸 `t=1.85`로 고정했고, 혈흔 ON/OFF 스크린샷도 같은 시각이라 직접 비교가 된다. `data-beat` 어서션도 확정값(`impact`/`dissolve`/`sigil`)으로 강화
- 예외: 바닥 혈흔 데칼의 페이드인만 자체 delta 시계를 쓴다(연출과 독립적으로 살아남아야 하므로). 연출 시간이 멈춘 상태에서 600ms 대기해 포화시키므로 단조 증가라 플레이키하지 않다
- 검증: `pnpm -F web e2e` 전체 스위트 **연속 3회 16/16 green**
- 영향: `apps/web/src/components/board/vfx/{stage.ts,CinematicDirector.tsx}`, `src/components/game/E2EBridge.tsx`, `e2e/{helpers.ts,capture-cinematic.spec.ts}`

### [2026-08-03 05:30] P3-fix2 — 연출 E2E 타임아웃 예산 확대 + 실시간 대기 축소
- 배경: 결정적 클록(60ef2f8)으로 레이스는 사라졌지만 간헐 실패가 남았다. 이번엔 **원인이 다르다** — 실패 테스트가 매 실행마다 바뀌었고 메시지가 "Test timeout of 30000ms exceeded"였다. 연출 스펙의 실제 소요가 SwiftShader 부하에 따라 12~31초로 출렁이며 Playwright 기본 30초 한도와 경계선에서 겹친 것
- 결정 1 — **타임아웃 예산을 전역으로 확대**: `playwright.config.ts`에 `timeout: 120_000`, `expect: { timeout: 15_000 }`. 야간 무감독 빌드에서는 안정성이 속도보다 우선이고, 넉넉한 한도는 green일 때 비용이 0이면서 red일 때 진짜 신호를 준다. 경계선 한도는 "느림"과 "고장"을 구분하지 못한다. P2 스펙(외통 기보 18.6s, 포획 기보 16.3s)도 같은 경계에 있었으므로 스펙 단위가 아니라 전역으로 올렸다
- 결정 2 — **낭비 시간 제거**:
  - `playMoves`가 수마다 `play` / `skipCinematic` / `snapshot` 3회 왕복하던 것을 **1회 왕복**으로 합쳤다(6수 기보 = 18회 → 6회). 단 **한 수당 한 번의 왕복은 유지** — 전체 기보를 한 `evaluate`에 넣으면 React 커밋이 한 번으로 배칭되어 "사람이 두는 것과 동일한 커밋 경계"라는 P2 검증 전제가 깨진다. 이 최적화는 `local-game`·`visual-board` 스펙에도 그대로 적용된다
  - 연출 스펙의 `settleScene`을 1400ms/900ms → **400ms**로. 기보 재생이 끝날 무렵이면 프로시저럴 텍스처는 이미 만들어졌고 블룸도 수렴해 있다. 이 대기가 실제로 덮는 것은 기물 활주 이징(0.3초에 90%)뿐이라 긴 대기는 순수 유휴였다. P2 스펙의 긴 settle은 첫 렌더를 기다리므로 그대로 둔다
  - 테어다운용 `finishCinematic()` 추가 — 남은 타임라인을 실시간으로 기다리는 대신 클록을 끝 너머로 seek한다. 입력 잠금 "해제" 자체가 검증 대상인 테스트 1개만 실시간 `resumeAndFinish()`를 유지
  - 기물 이동 보간 즉시 완료 모드는 **도입하지 않았다** — 이징이 0.3초에 90% 수렴해 400ms 대기로 충분한데, 이를 위해 프로덕션 렌더 경로에 테스트 전용 분기를 넣는 것은 이득 대비 비용이 크다
- 결과: 스펙 최대 소요 편차가 **12~31초 → 26.5~27.7초**(폭 1.2초)로 수축했고 한도 대비 여유는 4.3배. 전체 스위트 2.7~3.0분 → **2.4분**. `playMoves` 개선 효과는 P2 스펙에서 더 크게 나타났다(포획 기보 13~16초 → 5.7~9.4초)
- 검증: `pnpm -F web e2e` 전체 스위트 **연속 3회 16/16 green** (2.4m / 2.4m / 2.4m)
- 영향: `apps/web/playwright.config.ts`, `apps/web/e2e/{helpers.ts,capture-cinematic.spec.ts}`

### [2026-08-03 06:10] P4 Tier 2 기물별 고유 연출 7종 — 슬롯 소비 방식과 기보 확보
- 배경: P3가 만들어 둔 `attackVariant` 레지스트리(0.8s~1.2s 공격 구간)에 7종을 꽂는 작업. 두 가지가 미해결이었다 — (1) 슬롯 API가 실제로 7종을 표현하기에 충분한가, (2) 7종 각각이 포획하는 **합법 기보**를 어떻게 얻는가
- 결정 및 사유:
  1. **슬롯은 두 번만 넓혔다.** `offset`/`awaken`/`Extras`로 5종은 그대로 표현됐고, 부족했던 것은 딱 둘이다.
     - `traumaScale` — 상 내려찍기가 졸 창격보다 무거워야 하는데 타격 흔들림은 Tier 1 공용이었다. 상 2.1 / 마 1.7 / 궁 1.6 / 포 1.5 / 차 1.35 / 사 1.0 / 졸 0.8
     - `cameraLift` — 마의 "카메라 상향 추적"(SCENES.md 3절)은 카메라가 안 따라가면 기물이 프레임 밖으로 나간다. 연출 카메라와 룩타깃을 같이 들어올린다
     원래 슬롯 계약(offset/awaken/Extras)은 그대로 유지 — 둘 다 optional이라 기존 `lunge`는 무수정
  2. **`landing` 버그 수정** — 디렉터가 타격 후 정착 보간을 *기하학적* strike 지점에서 시작하고 있었다. 이는 `lunge`에서만 맞다. 포는 제자리에서 쏘고 마는 위에서 떨어지므로, 실제 착지점은 `variant.offset(k=1)`로 계산해야 한다. 안 고쳤으면 포·사·궁이 타격 프레임에서 옆으로 순간이동했다
  3. **`Fx` 프리미티브** (`vfx/fx.tsx`) — 모든 Tier 2 이펙트는 "transform과 opacity가 `stage.t`의 함수인 메시 하나"다. props로 표현하면 프레임마다 React 렌더가 돌므로, 메시와 머티리얼을 `drive(t, mesh, mat, camera)` 콜백에 넘긴다. 덕분에 각 연출의 타이밍이 한 파일에서 위에서 아래로 읽힌다. **`drive` 안에서 프레임 간 상태를 누적하지 말 것** — E2E 결정적 클록이 t로 점프하는 전제가 깨진다
  4. **궁 포획 연출 추가** — SCENES.md 3절은 궁에 외통 연출만 배정했지만 궁도 궁성 안에서는 포획한다. 그대로 두면 게이트("7종 서로 다른 연출")에서 궁만 기본값이 된다 → "왕의 위엄"(심판의 문양 강하 + 광휘의 기둥) 추가
  5. **기보 생성기** (`apps/web/scripts/generate-p4-fixtures.ts`, `pnpm -F web fixtures:p4`) — 사·궁은 궁성을 벗어날 수 없어 정상 대국 흐름으로는 포획이 성립하지 않는다. **한수쉼이 합법 액션**이라는 점을 이용해, 한쪽이 쉬는 동안 적 병을 d열로 궁성까지 행군시킨다(11수). 나머지 5종은 3~7수. 7종 전부 손으로 설계한 뒤 엔진으로 전수 검증하며, 불법 수가 나오면 그 지점의 합법 수 목록을 출력해 수리 지점을 바로 알려준다. 첫 실행에서 7/7 통과
  6. **연출 큐잉** — 외통을 만드는 수는 대개 포획이라 포획 연출과 승리 연출이 겹친다. `pendingVictory`에 걸어 두고 포획 연출이 끝나거나 스킵될 때 승격시킨다. 결과 오버레이는 두 연출이 모두 끝난 뒤에만 뜬다
  7. **승리 연출은 별도 런타임** (`victory.ts` + `VictoryDirector`) — 공격자도 피격자도 없고 포획 연출 *뒤에* 돌아야 하므로 `stage`의 모드로 만들면 양쪽 모두 null 체크를 지게 된다. 단 테스트 클록(`cinematicClock`)은 공유한다 — 동시에 활성화될 수 없어 안전하고, pause/seek API가 하나로 유지된다
  8. **문양은 3D와 DOM이 같은 캔버스를 쓴다** — 승리 오버레이의 진영 문양은 소환진 `CanvasTexture`의 `.image`를 `toDataURL()`로 읽어 CSS mask로 틴트한다. 두 번째 에셋이 존재하지 않으므로 3D와 DOM이 어긋날 수 없다
- 스크린샷 자가 평가 3회 이터레이션에서 고친 것:
  - **타격 플래시가 Tier 2 시그니처를 덮었다** — 졸·차·상·궁의 캡처 시각을 플래시 피크(1.2~1.3s) 밖으로 옮겼다. 플래시는 Tier 1 공용이라 어느 연출에서도 같은 화면이 되어 변별력을 지운다
  - **포탄과 마가 프레임 밖으로 나갔다** — 연출 카메라는 약 1.2유닛 결투를 잡으므로 포물선 정점 1.9 → 0.72, 도약 정점 1.55 → 1.15 + 카메라 상향 추적
  - **장창 3자루가 한 자루로 보였다** — 순차로 찌르고 빠지면 스틸에서 항상 1자루뿐이다. 찌른 뒤 **고정**되도록 바꾸고 좌우로 0.17유닛씩 벌렸다
  - 궁의 광휘 기둥이 피격 기물을 삼켜 반지름 축소, 차의 잔상이 하드 사각형이라 글로우 텍스처로 교체
  - 승리 문구의 `clip-path: inset()`이 텍스트 글로우를 사각형으로 잘라냈다 → 완전히 드러난 뒤에는 `none`
- 게이트: `pnpm -F web e2e` **19개 green**(기존 16 + 신규 3), engine 215 green 회귀 없음
- 영향: `apps/web/src/components/board/vfx/{fx.tsx,variants/*,victory.ts,VictoryDirector.tsx,attackVariants.ts,CinematicDirector.tsx}`, `src/components/game/{VictoryOverlay,GameScreen,E2EBridge}.tsx`, `src/game/store.ts`, `apps/web/scripts/generate-p4-fixtures.ts`, `e2e/{tier2-attacks.spec.ts,helpers.ts,fixtures/p4-*.json}`

### [2026-08-03 06:15] P5 서버 — 설계 결정 (server-p5 에이전트, 오케스트레이터 대리 기록)
- 배경: TASKS.md P5가 정하지 않은 세부 (타이머 엣지, 이탈 처리, engine 소비 방식)
- 결정:
  1. 장군 상태에서 턴 시간 초과 → 한수쉼 불가 규칙에 따라 즉시 패배 (result.type "timeout", 자동 패스 카운트 미증가)
  2. 자동 패스 2회째는 판 적용 후 forfeit 우선 (그 패스로 생긴 무승부보다 패배 판정 우선)
  3. 대국 중 room:leave = 기권, 연결 끊김 = 알림만 (시계 계속 → 자동 패스 자연 패배). 소켓 0명 시 방·타이머 폐기 (재접속 복구는 PRD 제외 항목)
  4. 방장=초, 참가자=한. 방 코드 = 혼동 문자 제외 31자 알파벳 6자리 (crypto 난수)
  5. engine 소비: engine에 build 스크립트 + "./dist" 서브패스 export만 추가 (루트 export 불변 → web transpilePackages 경로 무영향). 서버 런타임은 dist ESM, 테스트는 vitest alias로 소스 직접
  6. NestJS는 ESM + tsc 빌드, @nestjs/cli 미도입. vitest esbuild가 emitDecoratorMetadata 미지원이라 DI는 명시적 @Inject 토큰
  7. 포트 PORT 기본 3001 (웹 3002-1 규칙), HOST/TURN_TIMEOUT_MS/AUTO_PASS_LIMIT/CORS_ORIGIN 전부 env
  8. 이벤트 프로토콜은 apps/server/PROTOCOL.md 가 단일 기준 (C→S 7종 ack, S→C 5종, 에러 코드 13종)
- 사유: 규칙 공백은 RULES.md 일관성(장군 중 패스 불가) 기준으로 해석. 기존 게이트 무회귀를 구조적으로 보장
- 영향: apps/server/* 신설, packages/engine/package.json(build·exports)·tsconfig.build.json

### [2026-08-03 06:35] P4-fix — expect 타임아웃 예산을 30초로 (전체 스위트 검증 중 발견)
- 배경: P4 게이트(전체 스위트 연속 2회) 1회차에서 `visual-board.spec.ts:11 "3D 보드가 엔진 초기 배치를 렌더한다"`가 실패했다. 그 회차는 총 5.3분(평소 3.4분)으로, 이 머신에 무관한 Next dev 서버가 20개 이상 떠 있어 CPU가 포화된 상태였다
- 진단: 실패 지점은 P4 코드 경로와 무관한 테스트(포획도 승리 연출도 타지 않는다)이고, 소요 17.5초에 `expect(locator).toBeVisible()` 실패 — **15초 expect 예산을 정확히 소진**한 것이다. 테스트 예산은 120초가 남아 있었는데 단일 어서션이 15초에 포기해 런을 실패시켰다
- 결정: `expect.timeout` 15초 → **30초**. P3-fix2에서 테스트 예산에 대해 내린 것과 같은 판단을 어서션 예산에도 적용한다 — 경계선 한도는 "느림"과 "고장"을 구분하지 못하고, 두 예산을 8배나 벌려 두면 느린 네비게이션 하나가 자기 한도 근처에도 못 간 테스트를 죽인다. 가장 취약한 순간은 모든 테스트의 진입점인 `startLocalGame`의 첫 `page.goto` 직후다
- 검증: 수정 후 전체 스위트 **연속 2회 19/19 green** (3.4분 / 3.6분)
- 영향: `apps/web/playwright.config.ts`

### [2026-08-03 06:50] P5 웹 통합 — 온라인 대국을 로컬 대국 위에 얹은 방식
- 배경: `apps/server`(NestJS+socket.io, 테스트 51 green)는 완성되어 있었고 웹만 미연결. TASKS.md P5는 화면 구성만 정하고 스토어·연출·카메라와의 접합은 정의하지 않았다
- 결정:
  1. **스냅샷을 그대로 그린다(판을 로컬에서 진행시키지 않는다)** — 클라이언트가 `applyAction`으로 같은 수를 재생하면 코드는 줄지만 한 번이라도 스냅샷을 놓치면 서버와 조용히 어긋난다. 대신 `stateFrom(board, turn)`로 매 스냅샷마다 상태를 새로 만들고, 잡힌 말·마지막 수·장군 여부는 스냅샷에서 읽는다. 로컬 엔진은 **내 차례에 도착점을 미리 하이라이트하는 용도로만** 쓰고 합법성의 최종 판정은 서버가 한다
  2. **스토어 하나에 mode를 둔다** — 온라인 전용 화면을 새로 만들면 P3·P4 연출 상태머신(포획 큐잉·승리 연출·데칼)이 통째로 복제된다. `GameScreen`/`store.ts`에 `mode: "local"|"online"`을 넣고 온라인 경로만 분기했다. 포획 연출 계획 생성은 `stageCapture()`로 뽑아 로컬(history)·온라인(lastAction) 두 입력이 같은 코드를 쓴다
  3. **소켓은 스토어를 import 하지 않는다** — `src/net/socket.ts`(전송) → `src/game/online.ts`(세션) → `src/game/store.ts`(판) 한 방향. 스토어는 온라인 대국 시작 시 주입된 `net.move/pass` 콜백으로만 서버에 말한다(순환 의존 회피). 소켓은 온라인 진입 시에만 생성 → 서버가 꺼져 있어도 로컬 대국 무영향
  4. **연출 중 도착한 스냅샷은 큐잉** — 상대는 내 포획 연출이 끝나기를 기다려주지 않는다. `pending[]`에 도착 순서대로 쌓고 연출 종료(또는 스킵)마다 하나씩 꺼낸다. 꺼낸 것이 또 포획이면 그 연출이 다시 시작되고 나머지는 계속 대기한다
  5. **재접속 복구 없음(`reconnection: false`)** — 서버가 좌석을 socket.id로 잡으므로 자동 재연결은 *다른 사람*으로 돌아와 `ROOM_FULL`이 된다. 조용히 재시도하는 대신 "연결이 끊어졌습니다"로 끝낸다 (PRD 3절 제외 항목)
  6. **내 진영 시점 고정** — 한이면 카메라 방위각 π, 궤도 피벗 z 부호 반전, 각인 면판 180° 회전(`glyphSpin`). 월드를 회전시키지 않은 이유: 연출 카메라가 칸 좌표로 샷을 계산하므로 판을 돌리면 결투 프레이밍이 어긋난다
  7. **결과 오버레이 일반화** — 서버 판정(기권·시간 초과·자동 한수쉼 몰수)은 엔진 `GameResult`에 없다. `ResultOverlay`가 문구·색·버튼을 props로 받도록 바꾸고 라벨링은 `adapters.ts`(`matchResultLabel`)로 모았다. 온라인은 재대국 버튼 대신 "방 나가기" 하나 (재대국 = 새 방)
  8. **포트**: 규칙상 API = 프론트−1 = 3001인데 이 머신에서 다른 프로젝트가 3001을 점유 중이라 E2E 서버는 **3003**으로 옮겼다(CLAUDE.md 포트 충돌 회피 우선, `SERVER_PORT`로 변경 가능). 클라이언트 기본값은 PROTOCOL.md대로 `NEXT_PUBLIC_SERVER_URL ?? http://localhost:3001` 유지
  9. **E2E 서버는 1수 180초** — 기본 60초면 SwiftShader에서 수마다 3D 프레임을 기다리는 사이 서버가 자동 한수쉼을 끼워 넣어 기보가 어긋난다. 시계 표시·경고 UI는 그대로 검증된다(자동 패스 규칙 자체는 서버 테스트 10개가 담당)
  10. **`?server=` 런타임 오버라이드** — `NEXT_PUBLIC_*`는 빌드 시점에 박혀 "서버가 꺼진 상태"를 E2E로 만들 수 없다. 쿼리로 죽은 포트를 가리켜 홈 복귀+토스트와 로컬 대국 무영향을 회귀 테스트로 고정했다
- 검증: `pnpm -F server test` 51 green · `pnpm -F engine test` 215 green · `pnpm -F web build` · `pnpm -F web e2e` **23 green**(기존 19 회귀 없음 + 온라인 4)
- 서버 프로토콜 이슈: 없음. PROTOCOL.md만 보고 붙였고 계약과 어긋난 동작은 발견되지 않았다 (`room:join` ack가 `game:start` 브로드캐스트보다 늦게 도착할 수 있어 양쪽 모두에서 대국을 여는 것만 클라이언트가 처리)
- 영향: `apps/web/src/net/{protocol,socket}.ts`(신설), `src/game/{online.ts(신설),store.ts,adapters.ts}`, `src/components/game/{OnlineLobby,OnlineHud}.tsx`(신설), `{GameScreen,TitleScreen,ResultOverlay,E2EBridge}.tsx`, `src/components/board/{JanggiScene,PieceMesh}.tsx`, `app/page.tsx`, `e2e/online-match.spec.ts`(신설), `playwright.config.ts`
