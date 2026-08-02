"use client";

import type { GameResult } from "engine";
import { SIDE_THEME } from "@/src/components/board/palette";
import { resultLabel } from "@/src/game/adapters";

/** 외통 / 무승부 결과 오버레이 (docs/PRD.md 4절). */
export function ResultOverlay({
  result,
  onRematch,
  onTitle,
}: {
  result: GameResult;
  onRematch: () => void;
  onTitle: () => void;
}) {
  const { title, detail } = resultLabel(result);
  const accent =
    result.type === "checkmate"
      ? SIDE_THEME[result.winner].accent
      : "#d9c9a5";

  return (
    <div
      data-testid="result-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="대국 결과"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/72 px-6 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-[#3a3126] bg-[#0a0910]/90 px-8 py-10 text-center">
        <p className="text-[11px] tracking-[0.35em] text-[#8d8477]">대국 종료</p>
        <h2
          data-testid="result-title"
          className="text-4xl font-bold tracking-[0.2em]"
          style={{ color: accent, textShadow: `0 0 26px ${accent}66` }}
        >
          {title}
        </h2>
        <p data-testid="result-detail" className="text-sm text-[#c9bda6]">
          {detail}
        </p>

        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid="rematch-button"
            onClick={onRematch}
            className="flex-1 rounded-full border border-[#6d5c42] bg-black/50 px-5 py-2.5 text-sm tracking-widest text-[#f2e2c4] transition-colors hover:border-[#c9a86a] hover:text-[#ffeccb]"
          >
            재대국
          </button>
          <button
            type="button"
            data-testid="result-title-button"
            onClick={onTitle}
            className="flex-1 rounded-full border border-[#2c2721] bg-black/40 px-5 py-2.5 text-sm tracking-widest text-[#8d8477] transition-colors hover:border-[#4c453a] hover:text-[#c9bda6]"
          >
            타이틀로
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResultOverlay;
