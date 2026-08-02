# PROGRESS.md — 야간 빌드 진행 기록 (아침 브리핑용)

- 형식: `[완료 시각] 페이즈 — 한 줄 요약`

---

- [2026-08-03 02:56] P0 완료 — pnpm 모노레포(engine+web) 스캐폴드, engine vitest 더미 테스트 green, web에 R3F 캔버스 렌더 + Playwright E2E green, artifacts/p0-canvas.png 저장. 게이트 3종(`engine test`/`web build`/`web e2e`) 전부 통과.
- [2026-08-03 03:32] P1 완료 — 장기 룰 엔진(packages/engine, 런타임 의존성 0/ESM/strict) 구현. vitest **103개 전부 green**(RULES.md V01~V30 전수 + 자체 경계 케이스 73개). perft 초기 국면 **depth1=32(수 31 + 한수쉼), depth2=1024** 예외 없이 완주. E2E 기보 2종 생성·검증(`capture-game.json` 7수·6번째 수에서 초 차가 한 병 포획 / `mate-game.json` 9수 초 승 외통). 게이트 `pnpm -F engine test`·`pnpm -F web build` 통과.
