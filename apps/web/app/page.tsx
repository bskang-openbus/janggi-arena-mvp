"use client";

import { SfxDirector } from "@/src/audio/SfxDirector";
import { GameScreen } from "@/src/components/game/GameScreen";
import { OnlineLobby } from "@/src/components/game/OnlineLobby";
import { TitleScreen } from "@/src/components/game/TitleScreen";
import { useGameStore } from "@/src/game/store";

/**
 * Single-route app: 타이틀 ↔ 로비 ↔ 대국 is a store transition, not navigation,
 * so the WebGL context (and its procedural textures) survives the switch.
 *
 * `SfxDirector`는 화면 바깥(루트)에 둔다 — 대국 화면에만 붙어 있으면 타이틀·
 * 로비의 버튼음이 나지 않고, 첫 클릭(= 브라우저 오디오 잠금 해제 제스처)이
 * 하필 "로컬 대국" 버튼이라 그 클릭이 통째로 유실된다. 렌더는 하지 않는다.
 */
export default function Home() {
  const screen = useGameStore((s) => s.screen);
  return (
    <>
      <SfxDirector />
      {screen === "title" ? (
        <TitleScreen />
      ) : screen === "lobby" ? (
        <OnlineLobby />
      ) : (
        <GameScreen />
      )}
    </>
  );
}
