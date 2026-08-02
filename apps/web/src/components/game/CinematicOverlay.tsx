"use client";

/**
 * 연출 중 화면 레이어 (docs/SCENES.md 1절 "화면 효과").
 *
 * Three jobs, all of them DOM rather than WebGL:
 *   1. 입력 잠금 — it covers the canvas, so no pointer event can reach the board
 *   2. 스킵 — any click / tap anywhere ends the cinematic immediately
 *   3. 붉은 플래시 + 암전 레터박스 — driven by a raw rAF loop off `stage`,
 *      never React state, so the flash can live for a single frame.
 *
 * 혈흔 OFF면 플래시도 붉은색 대신 백금색으로 바뀐다 (SCENES.md 4절).
 */
import { useEffect, useRef } from "react";
import { stage, T } from "@/src/components/board/vfx/stage";

export function CinematicOverlay({ onSkip }: { onSkip: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const barTop = useRef<HTMLDivElement>(null);
  const barBottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const flash = flashRef.current;
      const dim = dimRef.current;
      const root = rootRef.current;

      if (flash) {
        flash.style.opacity = String(Math.min(0.55, stage.flash * 0.62));
        flash.style.background = stage.gore
          ? "radial-gradient(circle at 50% 46%, rgba(255,246,238,0.95) 0%, rgba(255,74,44,0.85) 34%, rgba(150,10,4,0.6) 100%)"
          : "radial-gradient(circle at 50% 46%, rgba(255,255,255,0.95) 0%, rgba(196,216,255,0.8) 34%, rgba(70,96,150,0.55) 100%)";
      }
      if (dim) dim.style.opacity = String(stage.dim * 0.62);
      const bar = `${(stage.dim * 6.5).toFixed(2)}vh`;
      if (barTop.current) barTop.current.style.height = bar;
      if (barBottom.current) barBottom.current.style.height = bar;
      if (root) {
        // E2E reads these to prove the "during" screenshot really is mid-shot
        root.dataset.t = stage.t.toFixed(3);
        root.dataset.beat =
          stage.t < T.sigil
            ? "intro"
            : stage.t < T.attack
              ? "sigil"
              : stage.t < T.impact
                ? "attack"
                : stage.t < T.dissolve
                  ? "impact"
                  : stage.t < T.restore
                    ? "dissolve"
                    : "restore";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      data-testid="cinematic-overlay"
      data-t="0"
      data-beat="intro"
      onClick={onSkip}
      onTouchStart={onSkip}
      className="absolute inset-0 z-30 cursor-pointer select-none"
    >
      {/* 배경 암전 — 보드 주변부만 눌러 두 기물에 시선을 모은다 */}
      <div
        ref={dimRef}
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 52%, rgba(0,0,0,0) 22%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.92) 100%)",
        }}
      />

      {/* 시네마틱 레터박스 */}
      <div
        ref={barTop}
        className="pointer-events-none absolute inset-x-0 top-0 bg-black"
        style={{ height: 0 }}
      />
      <div
        ref={barBottom}
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black"
        style={{ height: 0 }}
      />

      {/* 타격 플래시 (1~2프레임) */}
      <div
        ref={flashRef}
        data-testid="impact-flash"
        className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen"
      />

      <button
        type="button"
        data-testid="skip-cinematic-button"
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
        className="absolute right-3 top-3 z-10 rounded-full border border-[#6d5c42]/70 bg-black/60 px-3.5 py-1.5 text-[11px] tracking-[0.2em] text-[#e6d5b4] backdrop-blur transition-colors hover:border-[#c9a86a] hover:text-[#ffeccb] md:right-6 md:top-6 md:text-xs"
      >
        연출 스킵
      </button>
    </div>
  );
}

export default CinematicOverlay;
