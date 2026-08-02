"use client";

import { useGameStore } from "@/src/game/store";

/**
 * Minimal 타이틀 화면 (docs/PRD.md 4절). Styling is deliberately restrained —
 * P6 owns the 붓글씨/전통 문양 treatment.
 */
export function TitleScreen() {
  const startLocalGame = useGameStore((s) => s.startLocalGame);

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
            data-testid="online-button"
            disabled
            title="온라인 대국은 P5에서 제공됩니다"
            className="min-w-56 cursor-not-allowed rounded-full border border-[#2c2721] bg-black/30 px-8 py-3 text-base tracking-[0.2em] text-[#5b544a]"
          >
            온라인 대국
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
        한 화면에서 두 명이 번갈아 두는 로컬 대국입니다.
      </p>
    </main>
  );
}

export default TitleScreen;
