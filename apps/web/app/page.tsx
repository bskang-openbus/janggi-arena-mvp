"use client";

import { GameScreen } from "@/src/components/game/GameScreen";
import { TitleScreen } from "@/src/components/game/TitleScreen";
import { useGameStore } from "@/src/game/store";

/**
 * Single-route app: 타이틀 ↔ 대국 is a store transition, not navigation, so the
 * WebGL context (and its procedural textures) survives the switch.
 */
export default function Home() {
  const screen = useGameStore((s) => s.screen);
  return screen === "title" ? <TitleScreen /> : <GameScreen />;
}
