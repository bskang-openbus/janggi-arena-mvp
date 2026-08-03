"use client";

/**
 * SD 치비 캐릭터 컷인 레이어 (P8, CLAUDE.md 8절 / docs/SCENES.md 5절의 계승).
 *
 * SCENES.md 5절이 그리던 "타격 순간의 캐릭터 컷인"을, SKIP 처리됐던 로우폴리
 * 실루엣 대신 생성 스프라이트로 채운다. **연출 상태머신은 건드리지 않는다** —
 * P6 사운드와 같은 규약으로 `stage`(포획) / `victoryStage`(외통)를 rAF로
 * 관찰만 하고, 자기 좌표는 DOM에 직접 쓴다 (프레임당 React state 0회).
 *
 * 레이어 순서: 연출 오버레이(z-30) 위, 설정(z-40) 아래. `pointer-events-none`
 * 이므로 "연출 스킵" 탭은 그대로 아래 오버레이가 받는다.
 *
 * 폴백: 이미지가 실패로 확정된 캐릭터는 아예 붙이지 않고, 붙인 뒤 실패해도
 * `onError`가 숨긴다. 어느 경우든 기존 파티클/디졸브 연출은 그대로 재생된다.
 */
import { useEffect, useRef } from "react";
import { SIDE_THEME } from "@/src/components/board/palette";
import type { PieceType, Side } from "@/src/components/board/types";
import {
  clamp01,
  easeOutCubic,
  smoothstep,
  stage,
} from "@/src/components/board/vfx/stage";
import { victoryStage } from "@/src/components/board/vfx/victory";
import { useGameStore } from "@/src/game/store";
import {
  chibiFailed,
  chibiKey,
  chibiUrl,
  CUT,
  cutinRuntime,
  markChibiFailed,
  resetCutinRuntime,
  VCUT,
} from "./cutin";

/** 진영 → 화면 가장자리. 컷인은 언제나 "자기 진영 쪽"에서 들어온다. */
function edgeOf(side: Side): "left" | "right" {
  return side === "cho" ? "left" : "right";
}

interface SlotSpec {
  role: "attacker" | "victim" | "victory";
  side: Side;
  type: PieceType;
  edge: "left" | "right";
}

export function CutinLayer() {
  const enabled = useGameStore((s) => s.settings.cutin);
  const lowSpec = useGameStore((s) => s.settings.lowSpec);
  const gore = useGameStore((s) => s.settings.gore);
  const cinematic = useGameStore((s) => s.cinematic);
  const victory = useGameStore((s) => s.victory);

  const nodes = useRef<Record<string, HTMLElement | null>>({});
  const reg = (key: string) => (el: HTMLElement | null) => {
    nodes.current[key] = el;
  };

  cutinRuntime.enabled = enabled;

  /* ── 무엇을 붙일지 (React는 여기서 한 번만 렌더한다) ─────────────── */
  const capture: SlotSpec[] = [];
  if (enabled && cinematic) {
    const a = cinematic.attacker;
    const v = cinematic.victim;
    if (!chibiFailed(a.side, a.type)) {
      capture.push({
        role: "attacker",
        side: a.side,
        type: a.type,
        edge: edgeOf(a.side),
      });
    }
    if (!chibiFailed(v.side, v.type)) {
      capture.push({
        role: "victim",
        side: v.side,
        type: v.type,
        edge: edgeOf(v.side),
      });
    }
  }

  const victorySlot: SlotSpec | null =
    enabled && victory && !chibiFailed(victory.winner, "general")
      ? {
          role: "victory",
          side: victory.winner,
          type: "general",
          edge: edgeOf(victory.winner),
        }
      : null;

  const kind: "capture" | "victory" | null = cinematic
    ? "capture"
    : victory
      ? "victory"
      : null;

  cutinRuntime.kind = kind;
  cutinRuntime.attacker = cinematic
    ? chibiKey(cinematic.attacker.side, cinematic.attacker.type)
    : victorySlot
      ? chibiKey(victorySlot.side, victorySlot.type)
      : null;
  cutinRuntime.victim = cinematic
    ? chibiKey(cinematic.victim.side, cinematic.victim.type)
    : null;

  // 화면을 떠날 때만(타이틀 복귀 등) 관측 상태를 비운다. rAF 이펙트의 정리에
  // 두면 설정 변경으로 이펙트가 재실행될 때 진행 중인 컷인 정보까지 지워진다.
  useEffect(() => resetCutinRuntime, []);

  /* ── 매 프레임 (rAF) ──────────────────────────────────────────── */
  useEffect(() => {
    let raf = 0;

    const put = (
      key: string,
      opacity: number,
      transform?: string,
      filter?: string,
    ) => {
      const el = nodes.current[key];
      if (!el) return;
      el.style.opacity = opacity.toFixed(4);
      if (transform !== undefined) el.style.transform = transform;
      if (filter !== undefined) el.style.filter = filter;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);

      let visible = 0;
      let mounted = 0;
      let loaded = 0;

      /* ── 포획 컷인 ─────────────────────────────────────────────── */
      if (nodes.current.attackerWrap || nodes.current.victimWrap) {
        const t = stage.active ? stage.t : 0;
        const inK = clamp01((t - CUT.in) / (CUT.hit - CUT.in));
        const outK = clamp01((t - CUT.out) / (CUT.end - CUT.out));
        const gone = 1 - outK;
        // 타격 임펄스 — 히트스톱 동안 1.0에 머무르다 급격히 사그라든다
        const hit = t < CUT.hit ? 0 : Math.exp(-(t - CUT.hit) * 9);

        /* 공격측: 자기 진영 쪽에서 대각 슬라이드-인 + 살짝 확대 */
        const aEase = lowSpec ? inK : easeOutCubic(inK);
        const aDir = nodes.current.attackerWrap?.dataset.edge === "left" ? -1 : 1;
        const aOpacity = clamp01(aEase * 1.3) * gone;
        const aTx = lowSpec ? 0 : (1 - aEase) * 46 * aDir - hit * 3 * aDir;
        const aTy = lowSpec ? 0 : (1 - aEase) * 17;
        const aScale = lowSpec ? 1 : 0.86 + aEase * 0.18 + hit * 0.06;
        put(
          "attackerWrap",
          aOpacity,
          `translate(${aTx.toFixed(2)}%, ${aTy.toFixed(2)}%) scale(${aScale.toFixed(4)})`,
        );
        put("attackerBand", aOpacity);
        const lines = nodes.current.attackerLines;
        if (lines && !lowSpec) {
          // 패턴 주기(52px)로 감아 돌린다 — 시각은 stage.t의 함수이므로
          // 결정적 클록으로 seek한 프레임이 매번 같은 그림이 된다
          lines.style.transform = `translateX(${(((t - CUT.in) * 320) % 52).toFixed(1)}px)`;
        }
        if (aOpacity > 0.02) visible += 1;

        /* 피격측: 반대쪽에서 등장 → 타격에 흔들리며 뒤로 밀려 페이드아웃 */
        const vEase = lowSpec
          ? clamp01((t - CUT.in - 0.05) / (CUT.hit - CUT.in))
          : easeOutCubic(clamp01((t - CUT.in - 0.05) / (CUT.hit - CUT.in)));
        const vDir = nodes.current.victimWrap?.dataset.edge === "left" ? -1 : 1;
        const knock = t < CUT.hit ? 0 : 1 - Math.exp(-(t - CUT.hit) * 7);
        const vFade = 1 - smoothstep(CUT.hit, CUT.hit + 0.3, t);
        const vOpacity = clamp01(vEase * 1.3) * vFade;
        const vTx = lowSpec
          ? 0
          : (1 - vEase) * 40 * vDir + knock * 26 * vDir;
        const vTy = lowSpec ? 0 : (1 - vEase) * 12 - knock * 5;
        const shake = lowSpec
          ? 0
          : Math.sin((t - CUT.hit) * 118) * 10 * Math.max(0, hit);
        const vScale = lowSpec ? 1 : 0.9 + vEase * 0.1 - hit * 0.04;
        put(
          "victimWrap",
          vOpacity,
          `translate(${vTx.toFixed(2)}%, ${vTy.toFixed(2)}%) translateX(${shake.toFixed(2)}px) scale(${vScale.toFixed(4)})`,
        );
        put("victimBand", vOpacity * 0.8);
        // 0.75 상한 — 더 올리면 실루엣이 하얗게 날아가 누가 맞았는지 안 읽힌다
        put("victimFlash", Math.min(0.75, hit * 1.1));
        // 피격 순간 붉은(혈흔 OFF면 백금) 광휘가 캐릭터를 감싼다
        const halo = gore ? "255,86,52" : "196,216,255";
        put(
          "victimImg",
          1,
          undefined,
          `drop-shadow(0 0 ${(12 + 30 * hit).toFixed(1)}px rgba(${halo},${(0.35 + 0.5 * hit).toFixed(2)})) drop-shadow(0 12px 20px rgba(0,0,0,0.7))`,
        );
        if (vOpacity > 0.02) visible += 1;
      }

      /* ── 승리 컷인 ─────────────────────────────────────────────── */
      if (nodes.current.victoryWrap) {
        const vt = victoryStage.active ? victoryStage.t : 0;
        const k = clamp01((vt - VCUT.in) / VCUT.rise);
        const e = lowSpec ? k : easeOutCubic(k);
        const ty = lowSpec ? 0 : (1 - e) * 11;
        const scale = lowSpec ? 1 : 0.9 + e * 0.1;
        put(
          "victoryWrap",
          e,
          `translate(0%, ${ty.toFixed(2)}%) scale(${scale.toFixed(4)})`,
        );
        put("victoryGlow", e * 0.55);
        if (e > 0.02) visible += 1;
      }

      for (const key of ["attackerImg", "victimImg", "victoryImg"]) {
        const img = nodes.current[key] as HTMLImageElement | null;
        if (!img) continue;
        mounted += 1;
        if (img.naturalWidth > 0) loaded += 1;
      }

      cutinRuntime.visible = visible > 0;
      cutinRuntime.mounted = mounted;
      cutinRuntime.loaded = loaded;

      const root = nodes.current.root;
      if (root) {
        root.dataset.visible = visible > 0 ? "yes" : "no";
        root.dataset.loaded = String(loaded);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cutinRuntime.visible = false;
      cutinRuntime.loaded = 0;
      cutinRuntime.mounted = 0;
    };
  }, [lowSpec, gore]);

  const attacker = capture.find((c) => c.role === "attacker") ?? null;
  const victim = capture.find((c) => c.role === "victim") ?? null;

  return (
    <div
      ref={reg("root")}
      data-testid="cutin-layer"
      data-kind={kind ?? "none"}
      data-enabled={enabled ? "on" : "off"}
      data-visible="no"
      data-loaded="0"
      className="pointer-events-none absolute inset-0 z-[32] select-none overflow-hidden"
      aria-hidden
    >
      {attacker && (
        <>
          <SpeedBand
            edge={attacker.edge}
            side={attacker.side}
            bandRef={reg("attackerBand")}
            linesRef={reg("attackerLines")}
            strength={1}
          />
          <div
            ref={reg("attackerWrap")}
            data-testid="cutin-attacker-slot"
            data-edge={attacker.edge}
            className={`absolute bottom-[3%] h-[52vh] max-h-[66vmin] min-h-[200px] opacity-0 ${
              attacker.edge === "left" ? "left-[1.5vw]" : "right-[1.5vw]"
            }`}
            style={{ willChange: "transform, opacity" }}
          >
            <div className="relative h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={reg("attackerImg") as (el: HTMLImageElement | null) => void}
                data-testid="cutin-attacker"
                data-piece={chibiKey(attacker.side, attacker.type)}
                src={chibiUrl(attacker.side, attacker.type)}
                alt=""
                draggable={false}
                onError={() => markChibiFailed(attacker.side, attacker.type)}
                className="block h-full w-auto"
                style={{
                  filter: `drop-shadow(0 0 22px ${SIDE_THEME[attacker.side].accent}aa) drop-shadow(0 14px 22px rgba(0,0,0,0.8))`,
                }}
              />
            </div>
          </div>
        </>
      )}

      {victim && (
        <>
          <SpeedBand
            edge={victim.edge}
            side={victim.side}
            bandRef={reg("victimBand")}
            strength={0.55}
          />
          <div
            ref={reg("victimWrap")}
            data-testid="cutin-victim-slot"
            data-edge={victim.edge}
            className={`absolute bottom-[6%] h-[44vh] max-h-[56vmin] min-h-[170px] opacity-0 ${
              victim.edge === "left" ? "left-[2vw]" : "right-[2vw]"
            }`}
            style={{ willChange: "transform, opacity" }}
          >
            <div className="relative h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={reg("victimImg") as (el: HTMLImageElement | null) => void}
                data-testid="cutin-victim"
                data-piece={chibiKey(victim.side, victim.type)}
                src={chibiUrl(victim.side, victim.type)}
                alt=""
                draggable={false}
                onError={() => markChibiFailed(victim.side, victim.type)}
                className="block h-full w-auto"
                style={{
                  filter: `drop-shadow(0 0 14px ${SIDE_THEME[victim.side].accent}66) drop-shadow(0 12px 20px rgba(0,0,0,0.7))`,
                }}
              />
              {/* 피격 플래시 — 같은 스프라이트를 마스크로 써서 실루엣만 물들인다
                  (15세 수위: 섬광까지, 고어 표현 없음. 혈흔 OFF면 백금색) */}
              <div
                ref={reg("victimFlash")}
                data-testid="cutin-victim-flash"
                className="absolute inset-0 opacity-0 mix-blend-screen"
                style={{
                  backgroundColor: gore ? "#ff9a6e" : "#dfe9ff",
                  maskImage: `url(${chibiUrl(victim.side, victim.type)})`,
                  WebkitMaskImage: `url(${chibiUrl(victim.side, victim.type)})`,
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                }}
              />
            </div>
          </div>
        </>
      )}

      {victorySlot && (
        <div
          ref={reg("victoryWrap")}
          data-testid="cutin-victory-slot"
          data-edge={victorySlot.edge}
          className={`absolute bottom-[4%] h-[66vh] max-h-[80vmin] min-h-[230px] opacity-0 ${
            victorySlot.edge === "left" ? "left-[2vw]" : "right-[2vw]"
          }`}
          style={{ willChange: "transform, opacity" }}
        >
          <div
            ref={reg("victoryGlow")}
            className="pointer-events-none absolute -inset-x-[35%] -inset-y-[12%] opacity-0"
            style={{
              background: `radial-gradient(ellipse at 50% 62%, ${SIDE_THEME[victorySlot.side].accent}55 0%, ${SIDE_THEME[victorySlot.side].accent}1c 46%, transparent 72%)`,
            }}
          />
          <div className="relative h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={reg("victoryImg") as (el: HTMLImageElement | null) => void}
              data-testid="cutin-victory"
              data-piece={chibiKey(victorySlot.side, victorySlot.type)}
              src={chibiUrl(victorySlot.side, victorySlot.type)}
              alt=""
              draggable={false}
              onError={() => markChibiFailed(victorySlot.side, victorySlot.type)}
              className="block h-full w-auto"
              style={{
                filter: `drop-shadow(0 0 26px ${SIDE_THEME[victorySlot.side].accent}aa) drop-shadow(0 16px 26px rgba(0,0,0,0.8))`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 진영색 반투명 그라디언트 밴드 + 스피드라인 (화면 가장자리 고정).
 *
 * 캐릭터 박스가 아니라 뷰포트에 앵커해서 비스듬한 기둥을 만든다 — 캐릭터 폭에
 * 묶여 있으면 밴드가 좁아 "스티커 한 장"으로 읽힌다. 흰 배경 대신 어두운 화면
 * 위에 `screen` 블렌드로 얹어 기존 전통x판타지 톤을 유지한다
 * (CLAUDE.md 3절: 밴드도 100% 코드 생성 — 이미지 에셋이 아니다).
 */
function SpeedBand({
  edge,
  side,
  bandRef,
  linesRef,
  strength,
}: {
  edge: "left" | "right";
  side: Side;
  bandRef: (el: HTMLElement | null) => void;
  linesRef?: (el: HTMLElement | null) => void;
  strength: number;
}) {
  const accent = SIDE_THEME[side].accent;
  const dir = edge === "left" ? 90 : 270;
  const a = (v: number) =>
    Math.round(v * strength)
      .toString(16)
      .padStart(2, "0");

  return (
    <div
      ref={bandRef}
      className="pointer-events-none absolute -inset-y-[8%] w-[40vw] max-w-[560px] overflow-hidden opacity-0 mix-blend-screen"
      style={{
        [edge === "left" ? "left" : "right"]: "-4vw",
        transform: `skewX(${edge === "left" ? -9 : 9}deg)`,
        background: `linear-gradient(${dir}deg, ${accent}${a(0x7a)} 0%, ${accent}${a(0x3e)} 26%, ${accent}${a(0x18)} 56%, transparent 84%)`,
      }}
    >
      {linesRef && (
        <div
          ref={linesRef}
          className="absolute -inset-x-[25%] inset-y-0"
          style={{
            background: `repeating-linear-gradient(${dir + (edge === "left" ? 8 : -8)}deg, transparent 0 9px, ${accent}88 9px 12px, transparent 12px 52px)`,
            maskImage: `linear-gradient(${dir}deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 45%, transparent 76%)`,
            WebkitMaskImage: `linear-gradient(${dir}deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 45%, transparent 76%)`,
          }}
        />
      )}
    </div>
  );
}

export default CutinLayer;
