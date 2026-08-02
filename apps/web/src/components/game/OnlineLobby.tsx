"use client";

/**
 * 온라인 로비 (P5): 게스트 닉네임 → 방 만들기 / 방 코드 입장 → 대기실.
 *
 * 대기실까지 이 화면이 담당하고, `game:start`가 오면 스토어가 대국 화면으로
 * 전환한다. 서버에 닿지 못하면 타이틀로 되돌아가고 토스트만 남는다.
 */
import { useEffect } from "react";
import { SIDE_LABEL } from "@/src/game/adapters";
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  ROOM_CODE_LENGTH,
  useOnlineStore,
} from "@/src/game/online";
import { useGameStore } from "@/src/game/store";

export function OnlineLobby() {
  const intent = useOnlineStore((s) => s.intent);
  const phase = useOnlineStore((s) => s.phase);
  const busy = useOnlineStore((s) => s.busy);
  const nickname = useOnlineStore((s) => s.nickname);
  const codeInput = useOnlineStore((s) => s.codeInput);
  const roomCode = useOnlineStore((s) => s.roomCode);
  const mySide = useOnlineStore((s) => s.mySide);
  const error = useOnlineStore((s) => s.error);

  const setIntent = useOnlineStore((s) => s.setIntent);
  const setNickname = useOnlineStore((s) => s.setNickname);
  const setCodeInput = useOnlineStore((s) => s.setCodeInput);
  const createRoom = useOnlineStore((s) => s.createRoom);
  const joinRoom = useOnlineStore((s) => s.joinRoom);
  const leave = useOnlineStore((s) => s.leave);
  const dismissError = useOnlineStore((s) => s.dismissError);
  const hydrate = useOnlineStore((s) => s.hydrate);
  const goTitle = useGameStore((s) => s.goTitle);

  // localStorage는 클라이언트 전용 — SSR은 빈 닉네임으로 렌더된다
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const waiting = phase === "waiting";
  const submit = () => {
    if (intent === "create") void createRoom();
    else void joinRoom();
  };

  return (
    <main
      data-testid="online-lobby"
      data-phase={phase}
      className="relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#05060b] px-6 text-center"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 45% at 22% 30%, rgba(28,190,160,0.18), transparent 70%), radial-gradient(60% 45% at 78% 72%, rgba(200,50,40,0.20), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-[0.3em] text-[#f2e2c4] md:text-3xl">
          온라인 대국
        </h1>

        {waiting ? (
          <section className="mt-10 flex flex-col items-center gap-4 rounded-3xl border border-[#3a3126] bg-black/45 px-6 py-8 backdrop-blur">
            <p className="text-[11px] tracking-[0.35em] text-[#8d8477]">방 코드</p>
            <p
              data-testid="room-code"
              className="text-4xl font-bold tracking-[0.35em] text-[#ffe6b0] drop-shadow-[0_0_24px_rgba(255,190,110,0.45)]"
            >
              {roomCode}
            </p>
            <p className="text-xs leading-relaxed text-[#c9bda6]">
              상대에게 이 코드를 알려주세요.
              <br />
              내 진영: {mySide ? SIDE_LABEL[mySide] : "-"} (선수)
            </p>
            <p
              data-testid="waiting-banner"
              className="animate-pulse text-sm tracking-[0.2em] text-[#8d8477]"
            >
              상대를 기다리는 중…
            </p>
            <button
              type="button"
              data-testid="cancel-room-button"
              onClick={() => void leave()}
              className="mt-2 rounded-full border border-[#3a3126] bg-black/50 px-6 py-2 text-sm tracking-widest text-[#c9bda6] transition-colors hover:border-[#6d5c42] hover:text-[#f2e2c4]"
            >
              방 닫고 나가기
            </button>
          </section>
        ) : (
          <section className="mt-8 flex flex-col gap-4 rounded-3xl border border-[#3a3126] bg-black/45 px-6 py-7 text-left backdrop-blur">
            <div className="flex gap-2">
              <TabButton
                testId="lobby-tab-create"
                active={intent === "create"}
                onClick={() => setIntent("create")}
              >
                방 만들기
              </TabButton>
              <TabButton
                testId="lobby-tab-join"
                active={intent === "join"}
                onClick={() => setIntent("join")}
              >
                방 코드 입장
              </TabButton>
            </div>

            <label className="flex flex-col gap-1.5 text-[11px] tracking-[0.2em] text-[#8d8477]">
              게스트 닉네임 ({NICKNAME_MIN}~{NICKNAME_MAX}자)
              <input
                data-testid="nickname-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                maxLength={NICKNAME_MAX}
                placeholder="예: 장기왕"
                className="rounded-xl border border-[#3a3126] bg-black/60 px-3 py-2.5 text-base tracking-normal text-[#f2e2c4] outline-none transition-colors placeholder:text-[#4e483f] focus:border-[#c9a86a]"
              />
            </label>

            {intent === "join" && (
              <label className="flex flex-col gap-1.5 text-[11px] tracking-[0.2em] text-[#8d8477]">
                방 코드 ({ROOM_CODE_LENGTH}자리)
                <input
                  data-testid="room-code-input"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  maxLength={ROOM_CODE_LENGTH}
                  placeholder="ABC234"
                  className="rounded-xl border border-[#3a3126] bg-black/60 px-3 py-2.5 text-lg tracking-[0.3em] text-[#f2e2c4] outline-none transition-colors placeholder:text-[#4e483f] focus:border-[#c9a86a]"
                />
              </label>
            )}

            <button
              type="button"
              data-testid={
                intent === "create" ? "create-room-button" : "join-room-button"
              }
              disabled={busy}
              onClick={submit}
              className={`mt-1 rounded-full border px-6 py-3 text-sm tracking-[0.25em] transition-colors ${
                busy
                  ? "cursor-wait border-[#241f19] bg-black/30 text-[#4e483f]"
                  : "border-[#6d5c42] bg-black/55 text-[#f2e2c4] hover:border-[#c9a86a] hover:text-[#ffeccb]"
              }`}
            >
              {busy
                ? "연결 중…"
                : intent === "create"
                  ? "방 만들기"
                  : "입장하기"}
            </button>
          </section>
        )}

        <button
          type="button"
          data-testid="lobby-back-button"
          onClick={() => {
            void leave();
            goTitle();
          }}
          className="mt-6 text-xs tracking-[0.25em] text-[#6b6459] transition-colors hover:text-[#c9bda6]"
        >
          ← 타이틀로
        </button>
      </div>

      {error && (
        <div
          data-testid="online-error"
          role="alert"
          onClick={dismissError}
          className="absolute inset-x-0 bottom-10 mx-auto max-w-md cursor-pointer rounded-2xl border border-[#7d2b22] bg-[#2a0d0a]/90 px-5 py-3 text-sm leading-relaxed text-[#ffb3a8] backdrop-blur"
        >
          {error}
        </div>
      )}
    </main>
  );
}

function TabButton({
  children,
  active,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active}
      onClick={onClick}
      className={`flex-1 rounded-full border px-4 py-2 text-xs tracking-[0.2em] transition-colors ${
        active
          ? "border-[#c9a86a] bg-[#2a1d0f]/70 text-[#ffeccb]"
          : "border-[#2c2721] bg-black/40 text-[#8d8477] hover:text-[#c9bda6]"
      }`}
    >
      {children}
    </button>
  );
}

export default OnlineLobby;
