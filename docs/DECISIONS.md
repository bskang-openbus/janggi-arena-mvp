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
