"use client";

import { useCallback, useMemo, useState } from "react";
import { JanggiScene } from "@/src/components/board/JanggiScene";
import { squareKey } from "@/src/components/board/layout";
import type {
  PieceView,
  Side,
  SquareRef,
} from "@/src/components/board/types";
import {
  createInitialPieces,
  DEMO_FOCUS_ID,
  DEMO_MOVE,
  stubHighlights,
} from "@/src/demo/stubBoard";

/**
 * P2 visual demo. Everything here is throwaway presentation state — no rules,
 * no engine. It exists so the 3D layer can be eyeballed (and screenshotted)
 * before the engine is wired in.
 */
export default function Home() {
  const [pieces, setPieces] = useState<PieceView[]>(createInitialPieces);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<SquareRef[]>([]);
  const [lastMove, setLastMove] = useState<{
    from: SquareRef;
    to: SquareRef;
  } | null>(null);
  const [checkSide, setCheckSide] = useState<Side | null>(null);
  const [lowSpec, setLowSpec] = useState(false);

  const selectPiece = useCallback(
    (id: string | null) => {
      if (id === null || id === selectedPieceId) {
        setSelectedPieceId(null);
        setHighlights([]);
        return;
      }
      const piece = pieces.find((p) => p.id === id);
      setSelectedPieceId(piece ? id : null);
      setHighlights(piece ? stubHighlights(pieces, piece) : []);
    },
    [pieces, selectedPieceId],
  );

  const handleSquareClick = useCallback(
    (sq: SquareRef) => {
      const target = squareKey(sq);
      const isHighlighted = highlights.some((h) => squareKey(h) === target);
      const moving = pieces.find((p) => p.id === selectedPieceId);
      if (!moving || !isHighlighted) {
        selectPiece(null);
        return;
      }
      setLastMove({
        from: { file: moving.file, rank: moving.rank },
        to: sq,
      });
      setPieces((prev) =>
        prev
          .filter((p) => p.id === moving.id || squareKey(p) !== target)
          .map((p) =>
            p.id === moving.id ? { ...p, file: sq.file, rank: sq.rank } : p,
          ),
      );
      setSelectedPieceId(null);
      setHighlights([]);
    },
    [highlights, pieces, selectedPieceId, selectPiece],
  );

  /** scripted step so the last-move afterglow can be seen (and screenshotted) */
  const playDemoMove = useCallback(() => {
    const { from, to } = DEMO_MOVE;
    const mover = pieces.find(
      (p) => p.file === from.file && p.rank === from.rank,
    );
    if (!mover) return;
    setLastMove({ from: { ...from }, to: { ...to } });
    setPieces((prev) =>
      prev
        .filter((p) => p.id === mover.id || squareKey(p) !== squareKey(to))
        .map((p) =>
          p.id === mover.id ? { ...p, file: to.file, rank: to.rank } : p,
        ),
    );
    setSelectedPieceId(null);
    setHighlights([]);
  }, [pieces]);

  const reset = useCallback(() => {
    setPieces(createInitialPieces());
    setSelectedPieceId(null);
    setHighlights([]);
    setLastMove(null);
    setCheckSide(null);
  }, []);

  const selectedLabel = useMemo(() => {
    const p = pieces.find((x) => x.id === selectedPieceId);
    return p ? `${p.side === "cho" ? "초" : "한"} · ${p.type}` : "없음";
  }, [pieces, selectedPieceId]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05060b]">
      <JanggiScene
        pieces={pieces}
        selectedPieceId={selectedPieceId}
        highlights={highlights}
        lastMove={lastMove}
        checkSide={checkSide}
        onSquareClick={handleSquareClick}
        onPieceClick={selectPiece}
        lowSpec={lowSpec}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 md:p-7">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.35em] text-[#f2e2c4] drop-shadow-[0_0_18px_rgba(255,190,110,0.35)] md:text-3xl">
            장기 아레나
          </h1>
          <p className="mt-1 text-[11px] tracking-wider text-[#8d8477] md:text-xs">
            3D 보드 · 기물 프레젠테이션 레이어 (P2 비주얼 데모)
          </p>
        </div>
        <div className="hidden text-right text-[11px] leading-relaxed text-[#8d8477] md:block">
          <p>기물 클릭 → 선택 / 하이라이트 지점 클릭 → 이동</p>
          <p>드래그 회전 · 휠 확대</p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-4 text-xs md:p-5">
        <span
          className="rounded-full border border-[#3a3126] bg-black/50 px-3 py-1.5 text-[#c9bda6] backdrop-blur"
          data-testid="demo-selected-label"
        >
          선택: {selectedLabel}
        </span>
        <DemoButton testId="demo-play-move" onClick={playDemoMove}>
          예시 이동(e4→e5)
        </DemoButton>
        <DemoButton
          testId="demo-select-focus"
          onClick={() => selectPiece(DEMO_FOCUS_ID)}
        >
          초 포(b3) 선택
        </DemoButton>
        <DemoButton
          testId="demo-toggle-check"
          active={checkSide !== null}
          onClick={() => setCheckSide((c) => (c === null ? "han" : null))}
        >
          장군 표시
        </DemoButton>
        <DemoButton
          testId="demo-toggle-lowspec"
          active={lowSpec}
          onClick={() => setLowSpec((v) => !v)}
        >
          저사양 모드
        </DemoButton>
        <DemoButton testId="demo-reset" onClick={reset}>
          초기화
        </DemoButton>
      </div>
    </main>
  );
}

function DemoButton({
  children,
  onClick,
  testId,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 backdrop-blur transition-colors ${
        active
          ? "border-[#ff7a5f] bg-[#3a1512]/70 text-[#ffcabb]"
          : "border-[#3a3126] bg-black/50 text-[#c9bda6] hover:border-[#6d5c42] hover:text-[#f2e2c4]"
      }`}
    >
      {children}
    </button>
  );
}
