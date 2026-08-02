"use client";

import { useOnlineStore } from "@/src/game/online";
import { useGameStore } from "@/src/game/store";

/**
 * Minimal 타이틀 화면 (docs/PRD.md 4절). Styling is deliberately restrained —
 * P6 owns the 붓글씨/전통 문양 treatment.
 */
export function TitleScreen() {
  const startLocalGame = useGameStore((s) => s.startLocalGame);
  const openLobby = useOnlineStore((s) => s.openLobby);
  const error = useOnlineStore((s) => s.error);
  const dismissError = useOnlineStore((s) => s.dismissError);

  return (
    <main
      data-testid="title-screen"
      className="relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#05060b] px-6 text-center"
    >
      {/* faction glow, procedural — no external assets */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 45% at 22% 30%, rgba(28,190,160,0.18), transparent 70%), radial-gradient(60% 45% at 78% 72%, rgba(200,50,40,0.20), transparent 70%)",
        }}
      />

      <div className="relative">
        <h1 className="text-5xl font-bold tracking-[0.4em] text-[#f2e2c4] drop-shadow-[0_0_28px_rgba(255,190,110,0.45)] md:text-7xl">
          장기 아레나
        </h1>
        <p className="mt-4 text-xs tracking-[0.3em] text-[#8d8477] md:text-sm">
          JANGGI ARENA
        </p>

        <div className="mt-12 flex flex-col items-center gap-3">
          <button
            type="button"
            data-testid="start-local-button"
            onClick={startLocalGame}
            className="min-w-56 rounded-full border border-[#6d5c42] bg-black/50 px-8 py-3 text-base tracking-[0.2em] text-[#f2e2c4] backdrop-blur transition-colors hover:border-[#c9a86a] hover:bg-[#2a1d0f]/70 hover:text-[#ffeccb]"
          >
            로컬 대국
          </button>
          <button
            type="button"
            data-testid="online-create-button"
            onClick={() => openLobby("create")}
            title="방을 만들고 방 코드를 상대에게 알려줍니다"
            className="min-w-56 rounded-full border border-[#3b6f63] bg-black/50 px-8 py-3 text-base tracking-[0.2em] text-[#a8fff2] backdrop-blur transition-colors hover:border-[#3ce9ca] hover:bg-[#08302a]/70"
          >
            온라인 방 만들기
          </button>
          <button
            type="button"
            data-testid="online-join-button"
            onClick={() => openLobby("join")}
            title="상대가 알려준 6자리 방 코드로 입장합니다"
            className="min-w-56 rounded-full border border-[#7d4a42] bg-black/50 px-8 py-3 text-base tracking-[0.2em] text-[#ffb3a8] backdrop-blur transition-colors hover:border-[#e0554a] hover:bg-[#2a0d0a]/70"
          >
            방 코드 입장
          </button>
          <button
            type="button"
            data-testid="title-settings-button"
            disabled
            title="설정은 P6에서 제공됩니다"
            className="min-w-56 cursor-not-allowed rounded-full border border-[#2c2721] bg-black/30 px-8 py-3 text-base tracking-[0.2em] text-[#5b544a]"
          >
            설정
          </button>
        </div>
      </div>

      <p className="relative mt-14 text-[11px] leading-relaxed text-[#6b6459]">
        로컬 대국은 한 화면에서 두 명이 번갈아 둡니다.
        <br />
        온라인 대국은 방 코드로 1:1 대국을 진행합니다.
      </p>

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

export default TitleScreen;
