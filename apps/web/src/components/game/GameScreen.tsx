"use client";

import { useEffect } from "react";
import { JanggiScene } from "@/src/components/board/JanggiScene";
import { SIDE_THEME } from "@/src/components/board/palette";
import { SIDE_LABEL } from "@/src/game/adapters";
import { useGameStore } from "@/src/game/store";
import { CapturedPanel } from "./CapturedPanel";
import { CinematicOverlay } from "./CinematicOverlay";
import { E2EBridge } from "./E2EBridge";
import { ResultOverlay } from "./ResultOverlay";
import { SettingsOverlay } from "./SettingsOverlay";
import { VictoryOverlay } from "./VictoryOverlay";

/** 대국 화면 (docs/PRD.md 4절): 3D 보드 중앙, 상단 턴·장군, 좌우 잡힌 말, 하단 조작. */
export function GameScreen() {
  const pieces = useGameStore((s) => s.pieces);
  const selectedId = useGameStore((s) => s.selectedId);
  const highlights = useGameStore((s) => s.highlights);
  const lastMove = useGameStore((s) => s.lastMove);
  const lastMoveLabel = useGameStore((s) => s.lastMoveLabel);
  const checkSide = useGameStore((s) => s.checkSide);
  const capturedByCho = useGameStore((s) => s.capturedByCho);
  const capturedByHan = useGameStore((s) => s.capturedByHan);
  const canPass = useGameStore((s) => s.canPass);
  const turn = useGameStore((s) => s.state.turn);
  const result = useGameStore((s) => s.state.result);
  const moveCount = useGameStore((s) => s.state.history.length);

  const cinematic = useGameStore((s) => s.cinematic);
  const cinematicPhase = useGameStore((s) => s.cinematicPhase);
  const decals = useGameStore((s) => s.decals);
  const settings = useGameStore((s) => s.settings);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const victory = useGameStore((s) => s.victory);

  const selectPiece = useGameStore((s) => s.selectPiece);
  const clickSquare = useGameStore((s) => s.clickSquare);
  const pass = useGameStore((s) => s.pass);
  const restart = useGameStore((s) => s.restart);
  const goTitle = useGameStore((s) => s.goTitle);
  const endCinematic = useGameStore((s) => s.endCinematic);
  const skipCinematic = useGameStore((s) => s.skipCinematic);
  const commitDecal = useGameStore((s) => s.commitDecal);
  const endVictory = useGameStore((s) => s.endVictory);
  const skipVictory = useGameStore((s) => s.skipVictory);
  const openSettings = useGameStore((s) => s.openSettings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const hydrateSettings = useGameStore((s) => s.hydrateSettings);

  // localStorage is client-only; SSR renders the defaults and this reconciles
  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  const turnTheme = SIDE_THEME[turn];
  const inCheck = checkSide !== null;
  const playing = cinematicPhase === "cinematic";
  const celebrating = victory !== null;
  const lowSpec = settings.lowSpec;

  return (
    <main
      data-testid="game-screen"
      data-turn={turn}
      data-result={result ? result.type : "playing"}
      data-cinematic={cinematicPhase}
      data-victory={celebrating ? "playing" : "idle"}
      className="relative h-dvh w-full touch-none overflow-hidden bg-[#05060b]"
    >
      <JanggiScene
        pieces={pieces}
        selectedPieceId={selectedId}
        highlights={highlights}
        lastMove={lastMove}
        checkSide={checkSide}
        onSquareClick={clickSquare}
        onPieceClick={selectPiece}
        lowSpec={lowSpec}
        cinematic={cinematic}
        gore={settings.gore}
        decals={decals}
        onCinematicEnd={endCinematic}
        onDecalCommit={commitDecal}
        victory={victory}
        onVictoryEnd={endVictory}
      />

      {/* HUD dims while the cinematic runs so the duel owns the frame */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${
          playing || celebrating ? "opacity-35" : "opacity-100"
        }`}
      >
      {/* ── 상단: 턴 표시 + 장군 경고 + 마지막 수 ─────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-3 md:p-5">
        <div className="flex items-center gap-2">
          <span
            data-testid="turn-indicator"
            data-side={turn}
            className="rounded-full border px-4 py-1.5 text-sm font-semibold tracking-[0.2em] backdrop-blur md:text-base"
            style={{
              borderColor: turnTheme.accent,
              color: turnTheme.accentHot,
              backgroundColor: "rgba(0,0,0,0.55)",
              boxShadow: `0 0 22px ${turnTheme.accent}44`,
            }}
          >
            {SIDE_LABEL[turn]} 차례
          </span>
          <span className="rounded-full border border-[#2c2721] bg-black/45 px-3 py-1.5 text-[11px] text-[#8d8477] backdrop-blur">
            {moveCount}수
          </span>
        </div>

        {inCheck && !result && (
          <div
            data-testid="check-banner"
            role="status"
            className="animate-pulse rounded-full border border-[#ff3326] bg-[#3a0d0a]/80 px-4 py-1 text-xs font-semibold tracking-[0.25em] text-[#ffb3a8] backdrop-blur md:text-sm"
          >
            장군! {SIDE_LABEL[turn]}의 궁이 위험합니다
          </div>
        )}

      </div>

      {/* ── 마지막 수: 하단 조작 바 바로 위 (보드 상단을 가리지 않도록) ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-3 md:bottom-16">
        <div
          data-testid="last-move"
          className="max-w-[80vw] truncate rounded-full border border-[#2c2721] bg-black/55 px-3 py-1 text-[11px] tracking-wider text-[#c9bda6] backdrop-blur md:text-xs"
        >
          {lastMoveLabel ?? "대국 시작 — 초 선수"}
        </div>
      </div>

      {/* ── 좌우: 잡힌 말 목록 ────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 md:left-5">
        <CapturedPanel captor="cho" groups={capturedByCho} align="left" />
      </div>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 md:right-5">
        <CapturedPanel captor="han" groups={capturedByHan} align="right" />
      </div>

      {/* ── 하단: 조작 ─────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-3 text-xs md:p-5">
        <ControlButton
          testId="pass-button"
          onClick={pass}
          disabled={!canPass}
          title={
            result
              ? "대국이 종료되었습니다"
              : inCheck
                ? "장군 상태에서는 한수쉼(패스)을 할 수 없습니다"
                : "한수쉼 — 차례를 넘깁니다"
          }
        >
          한수쉼
        </ControlButton>
        <ControlButton
          testId="restart-button"
          onClick={restart}
          title="처음부터 다시 시작합니다"
        >
          재시작
        </ControlButton>
        <ControlButton
          testId="lowspec-button"
          onClick={() => updateSettings({ lowSpec: !lowSpec })}
          active={lowSpec}
          title="후처리 효과를 끄고 가볍게 렌더합니다"
        >
          저사양
        </ControlButton>
        <ControlButton
          testId="settings-button"
          onClick={() => openSettings(true)}
          title="혈흔·사운드·저사양 설정을 엽니다"
        >
          설정
        </ControlButton>
        <ControlButton
          testId="to-title-button"
          onClick={goTitle}
          title="타이틀 화면으로 돌아갑니다"
        >
          타이틀
        </ControlButton>
      </div>
      </div>

      {playing && <CinematicOverlay onSkip={skipCinematic} />}

      {victory && (
        <VictoryOverlay winner={victory.winner} onSkip={skipVictory} />
      )}

      {settingsOpen && (
        <SettingsOverlay
          settings={settings}
          onChange={updateSettings}
          onClose={() => openSettings(false)}
        />
      )}

      {result && !playing && !celebrating && (
        <ResultOverlay result={result} onRematch={restart} onTitle={goTitle} />
      )}

      <E2EBridge />
    </main>
  );
}

function ControlButton({
  children,
  onClick,
  testId,
  title,
  disabled = false,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
  title: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
      className={`pointer-events-auto rounded-full border px-3.5 py-1.5 backdrop-blur transition-colors md:px-4 ${
        disabled
          ? "cursor-not-allowed border-[#241f19] bg-black/30 text-[#4e483f]"
          : active
            ? "border-[#3ce9ca] bg-[#08302a]/70 text-[#a8fff2]"
            : "border-[#3a3126] bg-black/50 text-[#c9bda6] hover:border-[#6d5c42] hover:text-[#f2e2c4]"
      }`}
    >
      {children}
    </button>
  );
}

export default GameScreen;
