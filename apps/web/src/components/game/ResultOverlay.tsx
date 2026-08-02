"use client";

export interface ResultAction {
  label: string;
  testId: string;
  onClick: () => void;
}

/**
 * 대국 결과 오버레이 (docs/PRD.md 4절).
 *
 * 문구를 직접 받는 이유: 로컬은 엔진 결과(외통·무승부)만 나오지만 온라인은
 * 기권·시간 초과·자동 한수쉼 몰수까지 서버가 판정한다 (PROTOCOL.md 6절).
 * 두 경우의 라벨링은 `src/game/adapters.ts`가 담당한다.
 */
export function ResultOverlay({
  title,
  detail,
  accent,
  note,
  outcome,
  primary,
  secondary,
}: {
  title: string;
  detail: string;
  accent: string;
  /** 추가 안내 (온라인: 재대국 방법) */
  note?: string;
  /** 온라인에서 내 관점의 승패 — E2E와 색조에 쓰인다 */
  outcome?: "win" | "lose" | "draw";
  primary: ResultAction;
  secondary?: ResultAction;
}) {
  return (
    <div
      data-testid="result-overlay"
      data-outcome={outcome ?? "none"}
      role="dialog"
      aria-modal="true"
      aria-label="대국 결과"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/72 px-6 backdrop-blur-sm"
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-[#3a3126] bg-[#0a0910]/92 px-8 py-9 text-center"
        style={{ boxShadow: `0 0 60px ${accent}22, inset 0 0 40px rgba(0,0,0,0.5)` }}
      >
        {/* 머리 장식 — 타이틀 화면과 같은 문법 (선–한자–선) */}
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-[#6d5c42]" />
          <span className="text-[10px] tracking-[0.5em] text-[#8d8477]">
            對局終了
          </span>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#6d5c42]" />
        </div>

        <h2
          data-testid="result-title"
          className="text-4xl font-black tracking-[0.2em]"
          style={{ color: accent, textShadow: `0 0 26px ${accent}66` }}
        >
          {title}
        </h2>

        <span
          className="h-px w-24"
          style={{
            background: `linear-gradient(90deg,transparent,${accent}88,transparent)`,
          }}
        />

        <p data-testid="result-detail" className="text-sm text-[#c9bda6]">
          {detail}
        </p>
        {note && (
          <p className="text-[11px] leading-relaxed text-[#7a7264]">{note}</p>
        )}

        <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid={primary.testId}
            onClick={primary.onClick}
            className="flex-1 rounded-full border border-[#6d5c42] bg-black/50 px-5 py-2.5 text-sm font-semibold tracking-[0.18em] text-[#f2e2c4] transition-colors hover:border-[#c9a86a] hover:bg-[#2a1d0f]/70 hover:text-[#ffeccb]"
          >
            {primary.label}
          </button>
          {secondary && (
            <button
              type="button"
              data-testid={secondary.testId}
              onClick={secondary.onClick}
              className="flex-1 rounded-full border border-[#2c2721] bg-black/40 px-5 py-2.5 text-sm tracking-[0.18em] text-[#8d8477] transition-colors hover:border-[#4c453a] hover:text-[#c9bda6]"
            >
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultOverlay;
