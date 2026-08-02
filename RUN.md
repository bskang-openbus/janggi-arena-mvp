# RUN.md — 오늘 밤 실행 절차 (사용자용)

## 1. 준비 (5분)

```bash
# 작업 디렉터리 생성 후 이 패키지의 파일 배치
mkdir -p ~/night-builds/janggi-mvp && cd ~/night-builds/janggi-mvp
# CLAUDE.md, TASKS.md, RUN.md, docs/ 를 이 위치에 복사
git init && git add -A && git commit -m "kickoff: night build package"
```

- Mac Mini 슬립 방지 + 세션 유지:

```bash
tmux new -s janggi
caffeinate -dims &
```

## 2. 야간 루프 스크립트

- `night.sh` 로 저장 후 tmux 안에서 실행:

```bash
#!/bin/bash
cd ~/night-builds/janggi-mvp
LOG=night-$(date +%m%d).log
for i in $(seq 1 60); do
  if grep -q "ALL_DONE" TASKS.md; then
    echo "[night] ALL_DONE 감지, 종료" | tee -a "$LOG"
    break
  fi
  echo "[night] 세션 $i 시작 $(date)" | tee -a "$LOG"
  claude -p "CLAUDE.md의 작업 루프를 따르라. TASKS.md에서 첫 미완료 항목 하나를 완료하고, 검증 통과 후 체크·커밋하라. 질문 금지, 스스로 결정하고 DECISIONS.md에 기록하라." \
    --dangerously-skip-permissions >> "$LOG" 2>&1
  sleep 10
done
```

```bash
chmod +x night.sh && ./night.sh
```

- 세션당 항목 1개 처리 + 재기동 구조이므로 컨텍스트 한계·중단에 안전
- 60회 상한은 폭주 방지용

## 3. 안전 수칙

- `--dangerously-skip-permissions` 사용 시 전용 디렉터리에서만 실행 (권장: Docker/devcontainer 격리)
- API·클라우드 자격증명이 있는 셸 환경 변수는 제거된 상태로 실행
- 외부 배포(P6 Docker)는 빌드까지만, 실서버 배포는 아침에 직접 확인 후 진행

## 4. 아침 확인 순서

1. `PROGRESS.md` — 페이즈 완료 현황 요약
2. `TASKS.md` — `[S]`/`[~]` 항목과 사유
3. `docs/DECISIONS.md` — 자율 결정 목록
4. `artifacts/` — E2E 스크린샷
5. `pnpm install && pnpm -F engine test && pnpm -F web dev` — 직접 플레이
