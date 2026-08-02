"use client";

/**
 * 외통 승리 전체화면 연출 (P4, docs/SCENES.md 3절 궁 항목).
 *
 * 전체 화면 암전 → 승자 진영 문양 전개 → "외통" 붓글씨 문구 → 승자 표기.
 * The camera rotation half of the shot lives in `VictoryDirector`; this is the
 * screen layer over it.
 *
 * The 문양 is the same procedural 팔괘 canvas the 소환진 uses — read straight
 * off the `CanvasTexture` as a data URL and tinted through a CSS mask, so the
 * 3D and DOM layers can never drift apart and no second asset exists.
 *
 * Like the capture cinematic: driven by a raw rAF loop off `victoryStage`,
 * never React state, and a click anywhere skips to the result.
 */
import { useEffect, useMemo, useRef } from "react";
import { getSigilTexture } from "@/src/components/board/vfx/vfxTextures";
import { victoryStage, VT } from "@/src/components/board/vfx/victory";
import { SIDE_THEME } from "@/src/components/board/palette";
import { SIDE_LABEL } from "@/src/game/adapters";
import type { Side } from "engine";

/** 붓글씨 감성: 명조 계열이 있으면 그것으로, 없으면 시스템 serif. */
const BRUSH_FONT =
  '"Nanum Myeongjo", "AppleMyungjo", "Songti SC", "STSong", "Hiragino Mincho ProN", "Batang", serif';

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function VictoryOverlay({
  winner,
  onSkip,
}: {
  winner: Side;
  onSkip: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const sigilRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  const theme = SIDE_THEME[winner];

  const sigilUrl = useMemo(() => {
    const tex = getSigilTexture();
    const canvas = tex?.image as HTMLCanvasElement | undefined;
    try {
      return canvas?.toDataURL?.() ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = victoryStage.t;

      if (dimRef.current) {
        dimRef.current.style.opacity = String(victoryStage.dim * 0.88);
      }

      if (sigilRef.current) {
        const k = clamp01((t - VT.sigil) / 0.85);
        const eased = 1 - (1 - k) ** 3;
        sigilRef.current.style.opacity = String(eased * 0.55);
        sigilRef.current.style.transform = `translate(-50%, -50%) scale(${
          0.55 + eased * 0.5
        }) rotate(${t * 9}deg)`;
      }

      if (wordRef.current) {
        // 붓으로 한 획 긋듯 좌→우로 드러난다
        const k = clamp01((t - VT.word) / 0.55);
        const eased = 1 - (1 - k) ** 2;
        // clip-path cuts to the border box, which would slice the text glow
        // into a visible rectangle — drop it entirely once fully revealed
        wordRef.current.style.clipPath =
          k >= 1 ? "none" : `inset(-40% ${(1 - eased) * 100}% -40% -12%)`;
        wordRef.current.style.opacity = String(clamp01(k * 4));
        wordRef.current.style.transform = `scale(${1.16 - eased * 0.16})`;
      }

      if (nameRef.current) {
        const k = clamp01((t - VT.winner) / 0.5);
        nameRef.current.style.opacity = String(k);
        nameRef.current.style.transform = `translateY(${(1 - k) * 14}px)`;
      }

      const root = rootRef.current;
      if (root) {
        root.dataset.t = t.toFixed(3);
        root.dataset.beat =
          t < VT.sigil
            ? "dim"
            : t < VT.word
              ? "sigil"
              : t < VT.winner
                ? "word"
                : "winner";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      data-testid="victory-overlay"
      data-t="0"
      data-beat="dim"
      data-winner={winner}
      onClick={onSkip}
      onTouchStart={onSkip}
      className="absolute inset-0 z-30 flex cursor-pointer select-none items-center justify-center overflow-hidden"
    >
      <div
        ref={dimRef}
        className="pointer-events-none absolute inset-0 bg-black opacity-0"
      />

      {/* 승자 진영 문양 */}
      <div
        ref={sigilRef}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[92vmin] w-[92vmin] opacity-0"
        style={
          sigilUrl
            ? {
                backgroundColor: theme.accent,
                maskImage: `url(${sigilUrl})`,
                WebkitMaskImage: `url(${sigilUrl})`,
                maskSize: "contain",
                WebkitMaskSize: "contain",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                filter: `drop-shadow(0 0 40px ${theme.accent}88)`,
              }
            : { backgroundColor: "transparent" }
        }
      />

      <div className="pointer-events-none relative flex flex-col items-center gap-6">
        <div
          ref={wordRef}
          data-testid="victory-word"
          className="opacity-0"
          style={{
            fontFamily: BRUSH_FONT,
            fontSize: "clamp(5rem, 22vmin, 15rem)",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#fdf3e0",
            textShadow: `0 0 46px ${theme.accent}, 0 0 110px ${theme.accent}66, 0 6px 26px rgba(0,0,0,0.85)`,
            lineHeight: 1,
          }}
        >
          외통
        </div>

        <div
          ref={nameRef}
          data-testid="victory-winner"
          className="opacity-0 text-lg tracking-[0.45em] md:text-2xl"
          style={{
            fontFamily: BRUSH_FONT,
            color: theme.accentHot,
            textShadow: `0 0 26px ${theme.accent}88`,
          }}
        >
          {SIDE_LABEL[winner]} 승
        </div>
      </div>

      <button
        type="button"
        data-testid="skip-victory-button"
        onClick={(e) => {
          e.stopPropagation();
          onSkip();
        }}
        className="absolute right-3 top-3 rounded-full border border-[#6d5c42]/70 bg-black/60 px-3.5 py-1.5 text-[11px] tracking-[0.2em] text-[#e6d5b4] backdrop-blur transition-colors hover:border-[#c9a86a] hover:text-[#ffeccb] md:right-6 md:top-6 md:text-xs"
      >
        연출 스킵
      </button>
    </div>
  );
}

export default VictoryOverlay;
