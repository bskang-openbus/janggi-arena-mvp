"use client";

import type { Side } from "engine";
import { SIDE_THEME } from "@/src/components/board/palette";
import type { CapturedGroup } from "@/src/game/adapters";
import { SIDE_LABEL } from "@/src/game/adapters";

/**
 * 잡힌 말 목록 — the trophies `captor` has taken, grouped by piece type.
 * Sits on the left (초) / right (한) edge of the match screen.
 */
export function CapturedPanel({
  captor,
  groups,
  align,
}: {
  captor: Side;
  groups: CapturedGroup[];
  align: "left" | "right";
}) {
  const theme = SIDE_THEME[captor];
  const total = groups.reduce((n, g) => n + g.count, 0);

  return (
    <section
      data-testid={`captured-${captor}`}
      data-total={total}
      aria-label={`${SIDE_LABEL[captor]}가 잡은 말`}
      className={`pointer-events-auto flex w-16 flex-col gap-1.5 rounded-2xl border border-[#2c2721] bg-black/55 p-2 backdrop-blur md:w-24 md:p-3 ${
        align === "right" ? "items-end text-right" : "items-start text-left"
      }`}
    >
      <header
        className="text-[10px] font-semibold leading-tight tracking-widest md:text-xs"
        style={{ color: theme.accentHot }}
      >
        {SIDE_LABEL[captor]} 전과
      </header>

      {total === 0 ? (
        <p className="text-[11px] text-[#7a7264] md:text-xs">—</p>
      ) : (
        <ul
          className={`flex flex-wrap gap-1 ${
            align === "right" ? "justify-end" : "justify-start"
          }`}
        >
          {groups.map((g) => (
            <li
              key={`${g.side}-${g.type}`}
              data-testid={`captured-${captor}-${g.type}`}
              title={`${g.glyph} × ${g.count}`}
              className="flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[11px] leading-none md:text-sm"
              style={{
                borderColor: `${SIDE_THEME[g.side].accent}44`,
                color: SIDE_THEME[g.side].accent,
                backgroundColor: "rgba(0,0,0,0.35)",
              }}
            >
              <span className="font-semibold">{g.glyph}</span>
              {g.count > 1 && (
                <span className="text-[9px] text-[#a89c86] md:text-[10px]">
                  ×{g.count}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CapturedPanel;
