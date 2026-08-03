"use client";

/**
 * 컴퓨터 대국 선택 화면 (P7).
 *
 * 난이도 3단계 + 진영(초 선수 / 한 후수)만 고르는 한 장짜리 패널. 톤은
 * 온라인 로비와 같은 언어(rounded-3xl 테두리 · black/45 · 금박 문자)를 쓰고,
 * 진영 카드만 초 녹청 / 한 적색으로 갈라 놓는다.
 */
import type { Side } from "engine";
import { useEffect, useState } from "react";
import { AI_LEVELS, type AiLevel } from "@/src/ai/aiClient";
import { SIDE_THEME } from "@/src/components/board/palette";
import { SIDE_LABEL } from "@/src/game/adapters";
import { useGameStore } from "@/src/game/store";
import { SettingsOverlay } from "./SettingsOverlay";
import { TraditionalPattern } from "./TraditionalPattern";

/** 난이도 아이콘 — 타이틀 메뉴와 같은 한자 카드 언어를 유지한다. */
const LEVEL_GLYPH: Record<AiLevel, string> = { 1: "初", 2: "中", 3: "高" };

export function AiSetupScreen() {
  const startAiGame = useGameStore((s) => s.startAiGame);
  const goTitle = useGameStore((s) => s.goTitle);

  const settings = useGameStore((s) => s.settings);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const openSettings = useGameStore((s) => s.openSettings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const hydrateSettings = useGameStore((s) => s.hydrateSettings);

  const [level, setLevel] = useState<AiLevel>(1);
  const [side, setSide] = useState<Side>("cho");

  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  return (
    <main
      data-testid="ai-setup"
      data-level={level}
      data-side={side}
      className="relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#05060b] px-6 text-center"
    >
      <TraditionalPattern />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 44% at 20% 24%, rgba(150,110,235,0.16), transparent 72%)," +
            "radial-gradient(58% 44% at 80% 76%, rgba(200,50,40,0.16), transparent 72%)," +
            "radial-gradient(78% 68% at 50% 48%, transparent 44%, rgba(3,4,8,0.84) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-[#7d6a4a]" />
          <span className="text-[10px] tracking-[0.6em] text-[#a08f6d]">
            對機對局
          </span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-[#7d6a4a]" />
        </div>

        <h1 className="text-2xl font-bold tracking-[0.3em] text-[#f2e2c4] md:text-3xl">
          컴퓨터 대국
        </h1>

        <section className="mt-7 flex flex-col gap-5 rounded-3xl border border-[#3a3126] bg-black/50 px-5 py-6 text-left backdrop-blur">
          {/* ── 난이도 ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] tracking-[0.3em] text-[#8d8477]">난이도</p>
            {AI_LEVELS.map((info) => (
              <button
                key={info.level}
                type="button"
                data-testid={`ai-level-${info.level}`}
                data-active={level === info.level}
                aria-pressed={level === info.level}
                onClick={() => setLevel(info.level)}
                className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                  level === info.level
                    ? "border-[#c9a86a] bg-[#2a1d0f]/70 text-[#ffeccb]"
                    : "border-[#2c2721] bg-black/40 text-[#c9bda6] hover:border-[#6d5c42]"
                }`}
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-current text-[14px] leading-none opacity-85"
                >
                  {LEVEL_GLYPH[info.level]}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold tracking-[0.16em]">
                    {info.label}
                  </span>
                  <span className="text-[10.5px] leading-snug text-[#7d7466]">
                    {info.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* ── 진영 ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] tracking-[0.3em] text-[#8d8477]">내 진영</p>
            <div className="flex gap-2">
              {(["cho", "han"] as const).map((option) => (
                <SideButton
                  key={option}
                  side={option}
                  active={side === option}
                  onClick={() => setSide(option)}
                />
              ))}
            </div>
            <p className="text-[10.5px] leading-snug text-[#6b6459]">
              초가 선수입니다. 한을 고르면 컴퓨터(초)가 먼저 둡니다.
            </p>
          </div>

          <button
            type="button"
            data-testid="ai-start-button"
            onClick={() => startAiGame({ level, mySide: side })}
            className="mt-1 rounded-full border border-[#6d5c42] bg-black/55 px-6 py-3 text-sm tracking-[0.25em] text-[#f2e2c4] transition-colors hover:border-[#c9a86a] hover:text-[#ffeccb]"
          >
            대국 시작
          </button>
        </section>

        <button
          type="button"
          data-testid="ai-setup-back-button"
          onClick={goTitle}
          className="mt-6 text-xs tracking-[0.25em] text-[#6b6459] transition-colors hover:text-[#c9bda6]"
        >
          ← 타이틀로
        </button>
      </div>

      {settingsOpen && (
        <SettingsOverlay
          settings={settings}
          onChange={updateSettings}
          onClose={() => openSettings(false)}
        />
      )}
    </main>
  );
}

function SideButton({
  side,
  active,
  onClick,
}: {
  side: Side;
  active: boolean;
  onClick: () => void;
}) {
  const theme = SIDE_THEME[side];
  return (
    <button
      type="button"
      data-testid={`ai-side-${side}`}
      data-active={active}
      aria-pressed={active}
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 rounded-2xl border px-3 py-3 transition-colors"
      style={{
        borderColor: active ? theme.accent : "#2c2721",
        backgroundColor: active ? `${theme.accent}14` : "rgba(0,0,0,0.4)",
        color: active ? theme.accentHot : "#8d8477",
      }}
    >
      <span className="text-lg font-bold leading-none tracking-[0.2em]">
        {SIDE_LABEL[side]}
      </span>
      <span className="text-[10px] tracking-[0.18em]">
        {side === "cho" ? "선수" : "후수"}
      </span>
    </button>
  );
}

export default AiSetupScreen;
