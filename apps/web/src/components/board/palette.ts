import type { PieceType, Side } from "./types";

/**
 * Visual identity — 전통(wood, ink, hanja) x 판타지(emissive edges, bloom).
 * 초 = 청록 / 한 = 진홍 (docs/PRD.md 5절).
 */
export interface SideTheme {
  /** Lacquered body tint of the piece. */
  body: string;
  /** Emissive colour baked into the body material. */
  bodyEmissive: string;
  /** Bright accent used for the engraved glyph + rim light. */
  accent: string;
  /** Slightly hotter accent for the selected/awakened state. */
  accentHot: string;
}

export const SIDE_THEME: Record<Side, SideTheme> = {
  cho: {
    // 옻칠(lacquer) teal over wood grain
    body: "#1c6155",
    bodyEmissive: "#0e7c6b",
    accent: "#3ce9ca",
    accentHot: "#a8fff2",
  },
  han: {
    body: "#7d2420",
    bodyEmissive: "#a01818",
    accent: "#ff6152",
    accentHot: "#ffb8ab",
  },
};

export const BOARD_COLORS = {
  background: "#05060b",
  woodDark: [49, 28, 14] as const,
  woodLight: [143, 100, 56] as const,
  edgeWood: "#3f2611",
  baseWood: "#1b1009",
  line: "#160c04",
  lineEmissive: "#5a3610",
};

export const MARKER_COLORS = {
  /** Legal empty destination. */
  move: "#ffe6ab",
  /** Legal destination occupied by a capturable piece. */
  capture: "#ff5a45",
  /** Last move afterglow. */
  trail: "#ffcf7a",
  /** 장군 warning pulse under the threatened 궁. */
  check: "#ff3326",
};

/** Hanja engraved on the top face. 궁 uses 楚 / 漢, 졸 uses 卒 / 兵. */
export function glyphFor(type: PieceType, side: Side): string {
  switch (type) {
    case "general":
      return side === "cho" ? "楚" : "漢";
    case "guard":
      return "士";
    case "chariot":
      return "車";
    case "cannon":
      return "包";
    case "horse":
      return "馬";
    case "elephant":
      return "象";
    case "soldier":
      return side === "cho" ? "卒" : "兵";
  }
}
