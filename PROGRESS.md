# PROGRESS.md — 야간 빌드 진행 기록 (아침 브리핑용)

- 형식: `[완료 시각] 페이즈 — 한 줄 요약`

---

- [2026-08-03 02:56] P0 완료 — pnpm 모노레포(engine+web) 스캐폴드, engine vitest 더미 테스트 green, web에 R3F 캔버스 렌더 + Playwright E2E green, artifacts/p0-canvas.png 저장. 게이트 3종(`engine test`/`web build`/`web e2e`) 전부 통과.
- [2026-08-03 03:32] P1 완료 — 장기 룰 엔진(packages/engine, 런타임 의존성 0/ESM/strict) 구현. vitest **103개 전부 green**(RULES.md V01~V30 전수 + 자체 경계 케이스 73개). perft 초기 국면 **depth1=32(수 31 + 한수쉼), depth2=1024** 예외 없이 완주. E2E 기보 2종 생성·검증(`capture-game.json` 7수·6번째 수에서 초 차가 한 병 포획 / `mate-game.json` 9수 초 승 외통). 게이트 `pnpm -F engine test`·`pnpm -F web build` 통과.
- [2026-08-03 03:52] P2 완료 — 엔진↔3D 보드 통합으로 로컬 2인 대국 완성. zustand 스토어(엔진 단일 진실원) + 어댑터 레이어로 시각 컴포넌트 무수정 소비, 타이틀→대국 화면 전환, 턴/장군 배너/잡힌 말(전과)/마지막 수/한수쉼(장군 시 비활성)/재시작/결과 오버레이, 모바일 터치 대응. 데모 스텁 제거. Playwright **12개 전부 green**(포획 기보 7수→兵 전과 표시, 외통 기보 9수→"초 승" 오버레이, 장군 중 패스 차단, 모바일 390px 가로 스크롤 0). 스크린샷 7장 artifacts/에 저장. 게이트 3종(`engine test` 103 green / `web build` / `web e2e`) 전부 통과.
- [2026-08-03 04:35] P3 완료 — Tier1 공통 포획 연출(2.9초) 구현. 상태머신(zustand 위상 + 가변 stage 싱글턴, 프레임 우선순위 −2), SCENES.md 2절 타임라인 전량(암전·측면 줌 카메라 → 팔괘 소환진 → 전방 돌진 → 히트스톱 100ms+붉은 플래시+충격파 2겹+스파크/혈흔/재 366파티클+트라우마 흔들림 → 커스텀 ShaderMaterial 디졸브(주홍 경계 발광) → 복귀), 혈흔 ON/OFF 설정 오버레이(OFF 시 백금색 대체·데칼 미생성), 연출 스킵(화면 탭/버튼), 바닥 혈흔 데칼 영속화. **P4 확장 슬롯**: 0.8~1.2s 공격 구간을 `attackVariant` 레지스트리로 분리(현재 `lunge` 1종, P4가 7종을 꽂음). Playwright **16개 전부 green**(기존 12 + 신규 4), engine 215개 회귀 없음. 스크린샷 자가 평가 3회 이터레이션(피격 기물 가림 → 타격 간격 0.64유닛, 각인 흰 뭉개짐 → 발광 상한 1.0, 카메라 고도 38°+듀얼 키라이트). artifacts/p3-{before,during,dissolve,after,nogore}.png 저장.
