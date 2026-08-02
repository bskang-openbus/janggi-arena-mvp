"use client";

/**
 * 설정 오버레이 (docs/PRD.md 4절): 혈흔 ON/OFF, 사운드 ON/OFF, 저사양 모드.
 *
 * Persisted straight to `localStorage` — no `zustand/persist`, because
 * CLAUDE.md 4절 pins the dependency list and the middleware buys nothing here.
 */
import type { Settings } from "@/src/game/store";

interface ToggleRow {
  key: keyof Settings;
  label: string;
  detail: string;
  disabled?: boolean;
}

const ROWS: ToggleRow[] = [
  {
    key: "gore",
    label: "혈흔 표현",
    detail: "포획 연출의 붉은 파티클과 바닥 자국. 끄면 백금색 스파크로 대체됩니다",
  },
  {
    key: "sound",
    label: "사운드",
    detail:
      "Web Audio 합성 효과음 (버튼·선택·착수·타격·외통). 끄면 오디오가 즉시 정지합니다",
  },
  {
    key: "lowSpec",
    label: "저사양 모드",
    detail:
      "블룸·비네트 후처리 OFF · 파티클 절반 · 렌더 해상도 1x · 그림자 1024px. 연출 구성은 그대로입니다",
  },
];

export function SettingsOverlay({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="설정"
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-[#3a3126] bg-[#0a0910]/95 px-6 py-7"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-[0.25em] text-[#f2e2c4]">
            설정
          </h2>
          <p className="text-[10px] tracking-[0.3em] text-[#8d8477]">OPTIONS</p>
        </header>

        <ul className="flex flex-col gap-2">
          {ROWS.map((row) => {
            const value = settings[row.key];
            return (
              <li key={row.key}>
                <button
                  type="button"
                  data-testid={`setting-${row.key}`}
                  data-value={value ? "on" : "off"}
                  disabled={row.disabled}
                  aria-pressed={value}
                  onClick={() => onChange({ [row.key]: !value })}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    row.disabled
                      ? "cursor-not-allowed border-[#241f19] bg-black/20 text-[#4e483f]"
                      : "border-[#3a3126] bg-black/40 text-[#c9bda6] hover:border-[#6d5c42]"
                  }`}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm tracking-widest">{row.label}</span>
                    <span className="text-[10px] leading-snug text-[#7d7466]">
                      {row.detail}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] tracking-[0.2em] ${
                      row.disabled
                        ? "border-[#241f19] text-[#4e483f]"
                        : value
                          ? "border-[#3ce9ca] bg-[#08302a]/70 text-[#a8fff2]"
                          : "border-[#4c453a] text-[#8d8477]"
                    }`}
                  >
                    {value ? "ON" : "OFF"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          data-testid="settings-close-button"
          onClick={onClose}
          className="mt-1 rounded-full border border-[#6d5c42] bg-black/50 px-5 py-2.5 text-sm tracking-widest text-[#f2e2c4] transition-colors hover:border-[#c9a86a] hover:text-[#ffeccb]"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

export default SettingsOverlay;
