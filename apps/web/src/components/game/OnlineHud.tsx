"use client";

/**
 * 온라인 대국 전용 HUD (P5).
 *
 * 로컬 대국 HUD 위에 얹히는 레이어: 방 코드·양측 닉네임·턴 시계·자동 한수쉼
 * 경고·상대 끊김 배너·항복(자체 확인 오버레이). 로컬 모드에서는 아예
 * 렌더되지 않는다.
 */
import { useEffect, useRef, useState } from "react";
import { SIDE_THEME } from "@/src/components/board/palette";
import { SIDE_LABEL } from "@/src/game/adapters";
import { formatClock, remainingMs, useOnlineStore } from "@/src/game/online";
import { useGameStore } from "@/src/game/store";

/** 시계는 초당 갱신 — 스냅샷과 offset만 읽으므로 보드는 리렌더되지 않는다. */
function TurnClock() {
  const latest = useOnlineStore((s) => s.latest);
  const clockOffset = useOnlineStore((s) => s.clockOffset);
  const mySide = useOnlineStore((s) => s.mySide);
  const [now, setNow] = useState(() => Date.now());
  const frame = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setNow(Date.now());
      frame.current = window.setTimeout(tick, 250);
    };
    frame.current = window.setTimeout(tick, 250);
    return () => {
      alive = false;
      window.clearTimeout(frame.current);
    };
  }, []);

  const left = remainingMs(latest, clockOffset, now);
  if (left === null || !latest) return null;

  const mine = latest.turn === mySide;
  const urgent = left <= 10_000;
  const theme = SIDE_THEME[latest.turn];

  return (
    <span
      data-testid="turn-clock"
      data-remaining={Math.round(left / 1000)}
      data-mine={mine}
      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold tabular-nums tracking-[0.2em] backdrop-blur md:text-xs ${
        urgent ? "animate-pulse" : ""
      }`}
      style={{
        borderColor: urgent ? "#ff3326" : theme.accent,
        color: urgent ? "#ffb3a8" : theme.accentHot,
        backgroundColor: "rgba(0,0,0,0.55)",
      }}
    >
      {mine ? "내 시간" : "상대 시간"} {formatClock(left)}
    </span>
  );
}

export function OnlineHud() {
  const roomCode = useOnlineStore((s) => s.roomCode);
  const room = useOnlineStore((s) => s.room);
  const mySide = useOnlineStore((s) => s.mySide);
  const latest = useOnlineStore((s) => s.latest);
  const notice = useOnlineStore((s) => s.notice);
  const error = useOnlineStore((s) => s.error);
  const resignAsking = useOnlineStore((s) => s.resignAsking);
  const askResign = useOnlineStore((s) => s.askResign);
  const resign = useOnlineStore((s) => s.resign);
  const dismissError = useOnlineStore((s) => s.dismissError);
  const matchResult = useGameStore((s) => s.matchResult);

  const me = room?.players.find((p) => p.side === mySide);
  const opponent = room?.players.find((p) => p.side !== mySide);
  const autoPass = mySide && latest ? latest.autoPassCount[mySide] : 0;
  const autoPassLimit = room?.autoPassLimit ?? 2;

  return (
    <>
      {/* ── 좌상단: 방 코드 · 양측 · 시계 ─────────────────────────── */}
      <div className="pointer-events-none absolute left-2 top-2 flex max-w-[60vw] flex-col items-start gap-1.5 md:left-5 md:top-5">
        <span
          data-testid="room-code-badge"
          className="rounded-full border border-[#3a3126] bg-black/55 px-3 py-1.5 text-[11px] tracking-[0.25em] text-[#c9bda6] backdrop-blur"
        >
          방 {roomCode}
        </span>
        <span
          data-testid="online-players"
          className="max-w-full truncate rounded-full border border-[#2c2721] bg-black/45 px-3 py-1 text-[11px] text-[#8d8477] backdrop-blur"
        >
          {mySide ? SIDE_LABEL[mySide] : "-"} {me?.nickname ?? "나"} vs{" "}
          {opponent ? `${SIDE_LABEL[opponent.side]} ${opponent.nickname}` : "상대"}
        </span>
        <TurnClock />
        {autoPass > 0 && !matchResult && (
          <span
            data-testid="auto-pass-warning"
            className="rounded-full border border-[#c98a2a] bg-[#2a1d0f]/85 px-3 py-1 text-[11px] tracking-wider text-[#ffd79a] backdrop-blur"
          >
            시간 초과 자동 한수쉼 {autoPass}/{autoPassLimit} — {autoPassLimit}회면 패배
          </span>
        )}
      </div>

      {/* ── 상대 연결 끊김 배너 ───────────────────────────────────── */}
      {notice && !matchResult && (
        <div
          data-testid="opponent-disconnected-banner"
          role="status"
          className="pointer-events-none absolute inset-x-0 top-16 mx-auto w-fit max-w-[86vw] rounded-full border border-[#7d5b22] bg-[#2a1d0a]/90 px-4 py-1.5 text-center text-[11px] leading-relaxed text-[#ffd79a] backdrop-blur md:top-20 md:text-xs"
        >
          {notice}
        </div>
      )}

      {/* ── 토스트 (비합법 수 · 상대 차례 등) ─────────────────────── */}
      {error && (
        <button
          type="button"
          data-testid="online-error"
          onClick={dismissError}
          className="pointer-events-auto absolute inset-x-0 bottom-20 mx-auto w-fit max-w-[86vw] rounded-2xl border border-[#7d2b22] bg-[#2a0d0a]/90 px-5 py-2.5 text-sm text-[#ffb3a8] backdrop-blur"
        >
          {error}
        </button>
      )}

      {/* ── 항복 확인 (브라우저 confirm 금지 — 자체 오버레이) ───────── */}
      {resignAsking && (
        <div
          data-testid="resign-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="항복 확인"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/72 px-6 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl border border-[#3a3126] bg-[#0a0910]/95 px-7 py-8 text-center">
            <p className="text-base tracking-[0.15em] text-[#f2e2c4]">
              정말 항복하시겠습니까?
            </p>
            <p className="text-xs leading-relaxed text-[#8d8477]">
              즉시 패배로 처리되며 되돌릴 수 없습니다.
            </p>
            <div className="flex w-full gap-2">
              <button
                type="button"
                data-testid="resign-confirm-yes"
                onClick={() => void resign()}
                className="flex-1 rounded-full border border-[#7d2b22] bg-[#2a0d0a]/80 px-4 py-2.5 text-sm tracking-widest text-[#ffb3a8] transition-colors hover:border-[#e0554a] hover:text-[#ffd9d2]"
              >
                항복
              </button>
              <button
                type="button"
                data-testid="resign-confirm-no"
                onClick={() => askResign(false)}
                className="flex-1 rounded-full border border-[#2c2721] bg-black/40 px-4 py-2.5 text-sm tracking-widest text-[#c9bda6] transition-colors hover:border-[#6d5c42] hover:text-[#f2e2c4]"
              >
                계속 두기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default OnlineHud;
