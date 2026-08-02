"use client";

/**
 * 사운드 디렉터 (P6) — 게임 상태와 연출 타임라인을 SFX에 연결한다.
 *
 * **부착 방식이 곧 설계다.** 스토어와 연출 상태머신은 한 줄도 건드리지 않는다:
 *   · 게임 이벤트  = `useGameStore.subscribe`로 이전/다음 상태를 비교해 유도
 *   · 연출 위상    = `stage`/`victoryStage` 런타임을 rAF로 읽어 비트 통과를 감지
 *   · UI 버튼      = document 위임 리스너 (버튼 컴포넌트 수정 0건)
 *
 * 연출 비트를 rAF로 읽는 이유: 연출은 60fps로 도는 뮤터블 싱글턴이라 위상마다
 * React state를 쓰지 않는다(stage.ts 주석 참조). 같은 규약을 따라 사운드도
 * 프레임 루프에서 읽는다. 결정론적 테스트 클록(seek)으로 시간이 건너뛰어도
 * "아직 안 울린 비트를 전부 소화"하므로 비트가 유실되지 않는다.
 */
import { useEffect } from "react";
import { stage, T } from "@/src/components/board/vfx/stage";
import { victoryStage, VT } from "@/src/components/board/vfx/victory";
import { useGameStore } from "@/src/game/store";
import {
  installGestureUnlock,
  playSfx,
  renderSfxOffline,
  sfxCounts,
  sfxState,
  setSfxEnabled,
  stopAllSfx,
} from "./engine";
import { attackSfxFor, SFX, type SfxId } from "./sfx";

/** 개발/E2E 빌드에서만 window에 오디오 훅을 노출한다 (E2EBridge와 같은 규칙). */
const ENABLED =
  process.env.NEXT_PUBLIC_E2E === "1" || process.env.NODE_ENV !== "production";

/* ------------------------------------------------------------------ */
/* 연출 비트                                                            */
/* ------------------------------------------------------------------ */

/** docs/SCENES.md 2절 타임라인의 소리 나는 지점. `attack`만 변주별로 바뀐다. */
const CAPTURE_BEATS: { t: number; id: SfxId | "attack" }[] = [
  { t: T.sigil, id: "cine.sigil" }, // 0.3s 소환진 전개
  { t: T.attack, id: "attack" }, // 0.8s Tier 2 공격 (7종 변주)
  { t: T.impact, id: "cine.impact" }, // 1.2s 타격 — 히트스톱과 같은 프레임
  { t: T.dissolve, id: "cine.dissolve" }, // 1.5s 디졸브 소멸
];

/**
 * 여기보다 앞에서 연출이 끝났다면 스킵이다 → 울리던 소리를 즉시 끊는다.
 * 정상 종료(2.3s 이후)면 디졸브 꼬리를 자연스럽게 남긴다.
 */
const CAPTURE_TAIL_SAFE = T.restore;
const VICTORY_TAIL_SAFE = VT.end - 0.35;

/* ------------------------------------------------------------------ */
/* UI 위임 리스너                                                       */
/* ------------------------------------------------------------------ */

function isLiveButton(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  const button = el.closest("button");
  if (!button || button.disabled) return null;
  return button;
}

function installUiSfx(): () => void {
  let hovered: Element | null = null;

  const onOver = (e: Event) => {
    const button = isLiveButton(e.target);
    if (!button || button === hovered) return;
    hovered = button;
    playSfx("ui.hover");
  };
  const onOut = (e: Event) => {
    if (hovered && isLiveButton(e.target) === hovered) hovered = null;
  };
  const onDown = (e: Event) => {
    if (isLiveButton(e.target)) playSfx("ui.click");
  };

  document.addEventListener("pointerover", onOver, { passive: true });
  document.addEventListener("pointerout", onOut, { passive: true });
  document.addEventListener("pointerdown", onDown, { passive: true });
  return () => {
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("pointerout", onOut);
    document.removeEventListener("pointerdown", onDown);
  };
}

/* ------------------------------------------------------------------ */
/* 스토어 구독                                                          */
/* ------------------------------------------------------------------ */

function installStoreSfx(): () => void {
  const initial = useGameStore.getState();
  setSfxEnabled(initial.settings.sound);
  /** 포획 연출 중에 장군이 걸리면 스팅을 연출 뒤로 미룬다 */
  let pendingCheck = false;

  return useGameStore.subscribe((s, prev) => {
    /* 설정 — 사운드 ON/OFF */
    if (s.settings.sound !== prev.settings.sound) {
      setSfxEnabled(s.settings.sound);
    }

    const moved = s.state.history.length > prev.state.history.length;
    // 재시작 / 타이틀 복귀 — 판이 통째로 갈렸다. 선택 해제를 "비합법"으로
    // 오해하지 않도록 여기서 끊고, 울리던 연출음도 정리한다.
    if (s.state.history.length < prev.state.history.length) {
      pendingCheck = false;
      stopAllSfx();
      return;
    }

    /* 착수 / 한수쉼 */
    if (moved) {
      const applied = s.state.history[s.state.history.length - 1];
      playSfx(applied?.action.kind === "pass" ? "game.pass" : "piece.move");
    }

    /* 기물 선택 · 비합법(선택 해제) */
    if (s.selectedId && s.selectedId !== prev.selectedId) {
      playSfx("piece.select");
    } else if (!s.selectedId && prev.selectedId && !moved) {
      // 선택 상태에서 둘 수 없는 곳을 눌렀다 → 스토어가 선택을 비운다
      playSfx("piece.deny");
    }

    /* 장군 경고 — 외통이면 팡파레가 대신한다 */
    if (moved && s.checkSide && !s.state.result) {
      if (s.cinematicPhase === "cinematic") pendingCheck = true;
      else playSfx("alert.check");
    }
    if (
      pendingCheck &&
      prev.cinematicPhase === "cinematic" &&
      s.cinematicPhase === "idle"
    ) {
      pendingCheck = false;
      if (s.checkSide && !s.state.result) playSfx("alert.check");
    }

    /* 외통 승리 */
    if (s.victory && !prev.victory) {
      pendingCheck = false;
      playSfx("victory.fanfare");
    }
  });
}

/* ------------------------------------------------------------------ */
/* 연출 타임라인 구독 (rAF)                                             */
/* ------------------------------------------------------------------ */

function installTimelineSfx(): () => void {
  let raf = 0;
  let capActive = false;
  let capBeat = 0;
  let capLastT = 0;
  let winActive = false;
  let winLastT = 0;

  const tick = () => {
    raf = requestAnimationFrame(tick);

    /* ── 포획 연출 ─────────────────────────────────────────────── */
    if (stage.active) {
      if (!capActive) {
        capActive = true;
        capBeat = 0;
      }
      while (capBeat < CAPTURE_BEATS.length && stage.t >= CAPTURE_BEATS[capBeat].t) {
        const beat = CAPTURE_BEATS[capBeat];
        capBeat += 1;
        playSfx(
          beat.id === "attack"
            ? attackSfxFor(useGameStore.getState().cinematic?.variant)
            : beat.id,
        );
      }
      capLastT = stage.t;
    } else if (capActive) {
      capActive = false;
      if (capLastT < CAPTURE_TAIL_SAFE) stopAllSfx(); // 스킵
      capLastT = 0;
    }

    /* ── 승리 연출 ─────────────────────────────────────────────── */
    if (victoryStage.active) {
      winActive = true;
      winLastT = victoryStage.t;
    } else if (winActive) {
      winActive = false;
      if (winLastT < VICTORY_TAIL_SAFE) stopAllSfx(); // 스킵
      winLastT = 0;
    }
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/* ------------------------------------------------------------------ */
/* 컴포넌트                                                            */
/* ------------------------------------------------------------------ */

export interface SfxDebugApi {
  counts: () => Record<string, number>;
  state: () => string;
  ids: () => string[];
  notes: () => Record<string, string>;
  /** OfflineAudioContext 렌더 — 파형/스펙트럼 자가검증용 */
  render: (
    id: string,
  ) => Promise<{ sampleRate: number; samples: number[] } | null>;
}

declare global {
  interface Window {
    __janggiSfx?: SfxDebugApi;
  }
}

/**
 * 렌더링하지 않는 부착 컴포넌트. 대국 화면이 마운트된 동안만 살아 있고,
 * 모든 작업은 effect 안에서만 일어나므로 SSR에 영향이 없다.
 */
export function SfxDirector() {
  useEffect(() => {
    // 잠금 해제가 먼저 등록돼야 첫 클릭에서 컨텍스트가 열린다
    const offUnlock = installGestureUnlock();
    const offUi = installUiSfx();
    const offStore = installStoreSfx();
    const offTimeline = installTimelineSfx();

    if (ENABLED && typeof window !== "undefined") {
      window.__janggiSfx = {
        counts: () => ({ ...sfxCounts }),
        state: sfxState,
        ids: () => Object.keys(SFX),
        notes: () =>
          Object.fromEntries(
            Object.entries(SFX).map(([id, def]) => [id, def.note]),
          ),
        render: async (id) => {
          const out = await renderSfxOffline(id as SfxId);
          return out
            ? { sampleRate: out.sampleRate, samples: Array.from(out.samples) }
            : null;
        },
      };
    }

    return () => {
      offTimeline();
      offStore();
      offUi();
      offUnlock();
      stopAllSfx();
      if (typeof window !== "undefined") delete window.__janggiSfx;
    };
  }, []);

  return null;
}

export default SfxDirector;
