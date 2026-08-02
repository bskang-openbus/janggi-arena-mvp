# PROGRESS.md — 야간 빌드 진행 기록 (아침 브리핑용)

- 형식: `[완료 시각] 페이즈 — 한 줄 요약`

---

- [2026-08-03 02:56] P0 완료 — pnpm 모노레포(engine+web) 스캐폴드, engine vitest 더미 테스트 green, web에 R3F 캔버스 렌더 + Playwright E2E green, artifacts/p0-canvas.png 저장. 게이트 3종(`engine test`/`web build`/`web e2e`) 전부 통과.
- [2026-08-03 03:32] P1 완료 — 장기 룰 엔진(packages/engine, 런타임 의존성 0/ESM/strict) 구현. vitest **103개 전부 green**(RULES.md V01~V30 전수 + 자체 경계 케이스 73개). perft 초기 국면 **depth1=32(수 31 + 한수쉼), depth2=1024** 예외 없이 완주. E2E 기보 2종 생성·검증(`capture-game.json` 7수·6번째 수에서 초 차가 한 병 포획 / `mate-game.json` 9수 초 승 외통). 게이트 `pnpm -F engine test`·`pnpm -F web build` 통과.
- [2026-08-03 03:52] P2 완료 — 엔진↔3D 보드 통합으로 로컬 2인 대국 완성. zustand 스토어(엔진 단일 진실원) + 어댑터 레이어로 시각 컴포넌트 무수정 소비, 타이틀→대국 화면 전환, 턴/장군 배너/잡힌 말(전과)/마지막 수/한수쉼(장군 시 비활성)/재시작/결과 오버레이, 모바일 터치 대응. 데모 스텁 제거. Playwright **12개 전부 green**(포획 기보 7수→兵 전과 표시, 외통 기보 9수→"초 승" 오버레이, 장군 중 패스 차단, 모바일 390px 가로 스크롤 0). 스크린샷 7장 artifacts/에 저장. 게이트 3종(`engine test` 103 green / `web build` / `web e2e`) 전부 통과.
