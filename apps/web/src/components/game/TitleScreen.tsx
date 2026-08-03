"use client";

import { useEffect } from "react";
import { useOnlineStore } from "@/src/game/online";
import { useGameStore } from "@/src/game/store";
import { SettingsOverlay } from "./SettingsOverlay";
import { TraditionalPattern } from "./TraditionalPattern";

/**
 * 타이틀 화면 (docs/PRD.md 4절).
 *
 * P6 마감 스타일링. 톤은 PRD 2절의 "전통 x 판타지":
 *   · 서체  Pretendard(CDN) 900 + 넓은 자간 + 잉크→금박 그라디언트 + 은은한 발광.
 *           붓글씨 폰트를 받아올 수 없으므로(외부 에셋 금지) 획 대비·자간·발광
 *           으로 붓글씨 "감성"을 만든다
 *   · 배경  `TraditionalPattern` — 격자·팔괘·구름을 코드로 그린 SVG
 *   · 색    초 녹청 / 한 적색을 좌우로 갈라 진영 대치를 배경으로 읽히게
 *
 * 로고 <h1>은 텍스트 노드 하나로 유지한다 (E2E가 `toHaveText("장기 아레나")`로
 * 검사하므로 글자별 span 분해 금지).
 */
export function TitleScreen() {
  const startLocalGame = useGameStore((s) => s.startLocalGame);
  const goAiSetup = useGameStore((s) => s.goAiSetup);
  const openLobby = useOnlineStore((s) => s.openLobby);
  const error = useOnlineStore((s) => s.error);
  const dismissError = useOnlineStore((s) => s.dismissError);

  const settings = useGameStore((s) => s.settings);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const openSettings = useGameStore((s) => s.openSettings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const hydrateSettings = useGameStore((s) => s.hydrateSettings);

  // localStorage는 클라이언트 전용 — SSR은 기본값을 그리고 여기서 맞춘다
  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  return (
    <main
      data-testid="title-screen"
      className="relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#05060b] px-6 text-center"
    >
      <TraditionalPattern />

      {/* 진영 발광 — 좌 초(녹청), 우 한(적색). 프로시저럴, 외부 에셋 없음 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 44% at 18% 26%, rgba(28,190,160,0.20), transparent 72%)," +
            "radial-gradient(58% 44% at 82% 74%, rgba(200,50,40,0.22), transparent 72%)," +
            "radial-gradient(46% 34% at 50% 42%, rgba(255,186,104,0.10), transparent 70%)",
        }}
      />
      {/* 비네트 — 문양 가장자리를 어둠에 묻는다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(78% 68% at 50% 48%, transparent 42%, rgba(3,4,8,0.82) 100%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* 머리 장식 — 楚漢對局 */}
        <div className="mb-7 flex items-center gap-3">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#7d6a4a]" />
          <span className="text-[10px] tracking-[0.62em] text-[#a08f6d] md:text-[11px]">
            楚漢對局
          </span>
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#7d6a4a]" />
        </div>

        <h1
          className="text-[3.15rem] leading-[1.05] font-black tracking-[0.16em] md:text-[4.75rem]"
          style={{
            backgroundImage:
              "linear-gradient(178deg,#fffaf0 4%,#f3dfb4 34%,#dcb56f 64%,#a97b34 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter:
              "drop-shadow(0 0 26px rgba(255,190,110,0.30)) drop-shadow(0 2px 1px rgba(0,0,0,0.65))",
          }}
        >
          장기 아레나
        </h1>

        {/* 붓 끝처럼 가늘어지는 획 — 로고 아래 강조선 */}
        <div className="mt-4 flex items-center gap-2.5">
          <span className="h-px w-16 bg-gradient-to-r from-transparent via-[#c9a86a] to-[#c9a86a] md:w-24" />
          <span className="size-1.5 rotate-45 bg-[#e6c98d] shadow-[0_0_10px_rgba(230,201,141,0.85)]" />
          <span className="h-px w-16 bg-gradient-to-l from-transparent via-[#c9a86a] to-[#c9a86a] md:w-24" />
        </div>

        <p className="mt-4 text-[10px] tracking-[0.5em] text-[#8d8477] md:text-xs">
          JANGGI ARENA
        </p>

        <nav className="mt-11 flex w-full flex-col items-stretch gap-2.5">
          {MENU.map((item) => (
            <MenuButton
              key={item.testId}
              {...item}
              onClick={
                item.testId === "start-local-button"
                  ? startLocalGame
                  : item.testId === "start-ai-button"
                    ? goAiSetup
                    : item.testId === "online-create-button"
                      ? () => openLobby("create")
                      : item.testId === "online-join-button"
                        ? () => openLobby("join")
                        : () => openSettings(true)
              }
            />
          ))}
        </nav>

        <p className="mt-10 text-[11px] leading-relaxed text-[#6b6459]">
          로컬 대국은 한 화면에서 두 명이 번갈아 둡니다.
          <br />
          컴퓨터 대국은 난이도 3단계 중에서 고를 수 있습니다.
          <br />
          온라인 대국은 6자리 방 코드로 1:1 대국을 진행합니다.
        </p>
      </div>

      {/* 낙관(落款) — 우하단 붉은 인장 */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-6 right-6 flex size-11 items-center justify-center rounded-[3px] border border-[#7a2119] text-[13px] leading-none font-bold tracking-tight text-[#b8402f] opacity-55 md:size-14 md:text-base"
        style={{ boxShadow: "inset 0 0 12px rgba(200,50,40,0.28)" }}
      >
        楚漢
      </div>

      {error && (
        <div
          data-testid="online-error"
          role="alert"
          onClick={dismissError}
          className="absolute inset-x-0 bottom-10 z-20 mx-auto max-w-md cursor-pointer rounded-2xl border border-[#7d2b22] bg-[#2a0d0a]/90 px-5 py-3 text-sm leading-relaxed text-[#ffb3a8] backdrop-blur"
        >
          {error}
        </div>
      )}

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

/* ------------------------------------------------------------------ */

interface MenuItem {
  testId: string;
  glyph: string;
  label: string;
  hint: string;
  title: string;
  /** border / glyph / label 색 — 초 녹청, 한 적색, 금박 */
  tone: { edge: string; hot: string; text: string; wash: string };
}

const GOLD = {
  edge: "#6d5c42",
  hot: "#e6c98d",
  text: "#f2e2c4",
  wash: "rgba(201,168,106,0.10)",
};
const CHO = {
  edge: "#2f6b5f",
  hot: "#3ce9ca",
  text: "#bff6ea",
  wash: "rgba(28,190,160,0.10)",
};
const HAN = {
  edge: "#7d4a42",
  hot: "#ff7a68",
  text: "#ffcabf",
  wash: "rgba(224,74,54,0.10)",
};
const MUTED = {
  edge: "#3a3126",
  hot: "#8d8477",
  text: "#c9bda6",
  wash: "rgba(140,132,119,0.06)",
};
/**
 * 컴퓨터 대국 (P7). 초·한 어느 쪽도 아니므로 진영색을 쓸 수 없다 — 단청의
 * 자주(紫)를 골라 "전통 x 판타지" 톤 안에 머물면서도 사람 대국과 구분된다.
 */
const MACHINE = {
  edge: "#4f4270",
  hot: "#c1a6ff",
  text: "#ddd0ff",
  wash: "rgba(150,110,235,0.10)",
};

const MENU: MenuItem[] = [
  {
    testId: "start-local-button",
    glyph: "對",
    label: "로컬 대국",
    hint: "한 화면에서 두 명이 번갈아",
    title: "한 기기에서 두 명이 번갈아 둡니다",
    tone: GOLD,
  },
  {
    testId: "start-ai-button",
    glyph: "智",
    label: "컴퓨터 대국",
    hint: "난이도 초급 · 중급 · 고급",
    title: "컴퓨터를 상대로 둡니다 (난이도와 진영을 고를 수 있습니다)",
    tone: MACHINE,
  },
  {
    testId: "online-create-button",
    glyph: "楚",
    label: "온라인 방 만들기",
    hint: "방 코드를 상대에게 전달",
    title: "방을 만들고 방 코드를 상대에게 알려줍니다",
    tone: CHO,
  },
  {
    testId: "online-join-button",
    glyph: "漢",
    label: "방 코드 입장",
    hint: "6자리 코드로 입장",
    title: "상대가 알려준 6자리 방 코드로 입장합니다",
    tone: HAN,
  },
  {
    testId: "title-settings-button",
    glyph: "設",
    label: "설정",
    hint: "혈흔 · 사운드 · 저사양",
    title: "혈흔·사운드·저사양 설정을 엽니다",
    tone: MUTED,
  },
];

function MenuButton({
  testId,
  glyph,
  label,
  hint,
  title,
  tone,
  onClick,
}: MenuItem & { onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      onClick={onClick}
      className="group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left backdrop-blur transition-all duration-200 hover:translate-x-0.5"
      style={{
        borderColor: tone.edge,
        backgroundColor: "rgba(4,6,11,0.62)",
        color: tone.text,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tone.hot;
        e.currentTarget.style.backgroundColor = tone.wash;
        e.currentTarget.style.boxShadow = `0 0 24px ${tone.hot}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tone.edge;
        e.currentTarget.style.backgroundColor = "rgba(4,6,11,0.62)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-base leading-none"
        style={{ borderColor: tone.edge, color: tone.hot }}
      >
        {glyph}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold tracking-[0.14em]">
          {label}
        </span>
        <span className="text-[10.5px] tracking-[0.06em] text-[#7d7466]">
          {hint}
        </span>
      </span>
      <span
        aria-hidden
        className="ml-auto text-[13px] opacity-40 transition-opacity group-hover:opacity-90"
        style={{ color: tone.hot }}
      >
        ›
      </span>
    </button>
  );
}

export default TitleScreen;
