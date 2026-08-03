/**
 * SD 치비 캐릭터 컷인 런타임 (P8, CLAUDE.md 8절).
 *
 * 헌법 8절이 허용하는 범위는 "포획 연출·피격 리액션의 컷인 레이어"뿐이다.
 * 보드·기물 본체·UI·배경은 여전히 100% 프로시저럴이고, 이 모듈은 그 위에
 * 얹히는 **DOM 한 장**만 관리한다.
 *
 * 설계 규약 (P6 SfxDirector와 동일):
 *   · 연출 상태머신(`stage`/`victoryStage`)과 스토어 코어는 한 줄도 고치지 않는다
 *   · 컷인은 `stage.t`를 rAF로 *관찰*해서 자기 시각을 계산한다 (구독/부착)
 *   · 프레임마다 React state를 쓰지 않는다 — 좌표·불투명도는 전부 DOM 직접 기입
 *
 * 폴백 규약: 이미지 한 장이 실패하면 그 컷인만 생략하고 기존 파티클/디졸브
 * 연출은 그대로 끝까지 재생된다. 파일이 아예 없어도(헤드리스·에셋 미배치)
 * 콘솔 워닝 한 줄만 남기고 게임은 정상 동작해야 한다.
 */
import type { PieceType, Side } from "@/src/components/board/types";
import { T } from "@/src/components/board/vfx/stage";
import { VT } from "@/src/components/board/vfx/victory";

export const CHIBI_SIDES: readonly Side[] = ["cho", "han"];
export const CHIBI_TYPES: readonly PieceType[] = [
  "general",
  "guard",
  "chariot",
  "cannon",
  "horse",
  "elephant",
  "soldier",
];

/** 7종 × 2진영 = 14장. `apps/web/public/chibi/{side}-{type}.webp` */
export const CHIBI_TOTAL = CHIBI_SIDES.length * CHIBI_TYPES.length;

export function chibiKey(side: Side, type: PieceType): string {
  return `${side}-${type}`;
}

/** 런타임 외부 네트워크 호출 없음 — 저장소에 커밋된 정적 파일만 서빙한다. */
export function chibiUrl(side: Side, type: PieceType): string {
  return `/chibi/${chibiKey(side, type)}.webp`;
}

/* ------------------------------------------------------------------ */
/* 프리로드                                                             */
/* ------------------------------------------------------------------ */

type LoadStatus = "loading" | "ready" | "failed";

const status = new Map<string, LoadStatus>();

/** 진단·E2E용 집계 (표시 여부 판정에는 쓰지 않는다). */
export const chibiStats = {
  total: CHIBI_TOTAL,
  ready: 0,
  failed: 0,
  started: false,
};

/**
 * 대국 화면 진입 시 14장을 브라우저 캐시로 끌어온다.
 *
 * 성공/실패 어느 쪽도 게임 흐름을 막지 않는다 — 컷인은 이 캐시가 채워졌든
 * 아니든 `<img>`를 그대로 붙이고, 실패한 것만 `onError`로 숨긴다.
 */
export function preloadChibi(): void {
  if (typeof window === "undefined" || chibiStats.started) return;
  chibiStats.started = true;

  for (const side of CHIBI_SIDES) {
    for (const type of CHIBI_TYPES) {
      const key = chibiKey(side, type);
      if (status.get(key) === "ready") continue;
      status.set(key, "loading");

      const img = new window.Image();
      img.decoding = "async";
      img.onload = () => {
        if (status.get(key) === "ready") return;
        status.set(key, "ready");
        chibiStats.ready += 1;
      };
      img.onerror = () => {
        if (status.get(key) === "failed") return;
        status.set(key, "failed");
        chibiStats.failed += 1;
        console.warn(
          `[chibi] 컷인 이미지를 불러오지 못했습니다: ${key} — 해당 컷인만 생략하고 기존 연출로 진행합니다`,
        );
      };
      img.src = chibiUrl(side, type);
    }
  }
}

/** 이미 실패가 확정된 캐릭터인가 (그러면 컷인 자체를 붙이지 않는다). */
export function chibiFailed(side: Side, type: PieceType): boolean {
  return status.get(chibiKey(side, type)) === "failed";
}

/** `<img onError>` — 프리로드를 건너뛴 경로에서 실패를 잡는 두 번째 그물. */
export function markChibiFailed(side: Side, type: PieceType): void {
  const key = chibiKey(side, type);
  if (status.get(key) === "failed") return;
  status.set(key, "failed");
  chibiStats.failed += 1;
  console.warn(
    `[chibi] 컷인 이미지를 불러오지 못했습니다: ${key} — 해당 컷인만 생략하고 기존 연출로 진행합니다`,
  );
}

/* ------------------------------------------------------------------ */
/* 타임라인                                                             */
/* ------------------------------------------------------------------ */

/**
 * 포획 컷인 (연출 초). 타격(T.impact = 1.2s)을 사이에 두고 앞뒤로 걸친다.
 *
 * 총 노출 = (end − in) 연출초 0.70s + 히트스톱 0.10s = 실시간 약 0.80초로,
 * 지시받은 0.6~0.9초 구간에 들어온다. 연출 자체(2.9s)를 늘리지 않으므로
 * 기존 타임라인·게이트에 영향이 없다.
 */
export const CUT = {
  /** 슬라이드-인 시작 — 공격 구간(0.8s) 중반 */
  in: T.impact - 0.28,
  /** 타격 = 컷인의 정점 (히트스톱으로 여기서 시간이 멈춘다) */
  hit: T.impact,
  /** 퇴장 시작 */
  out: T.impact + 0.16,
  /** 완전 제거 */
  end: T.impact + 0.42,
} as const;

/** 승리 컷인 — 문양 전개(VT.sigil)와 같은 박자에 등장해 끝까지 남는다. */
export const VCUT = {
  in: VT.sigil,
  /** 등장 연출 길이 */
  rise: 0.6,
} as const;

/* ------------------------------------------------------------------ */
/* 관측 상태 (E2E 스냅샷)                                                */
/* ------------------------------------------------------------------ */

export interface CutinRuntime {
  /** 설정 토글 */
  enabled: boolean;
  /** "capture" | "victory" | null — 지금 붙어 있는 컷인의 종류 */
  kind: "capture" | "victory" | null;
  /** 실제로 화면에 보이는가 (불투명도 > 0.02) */
  visible: boolean;
  /** DOM에 붙어 있고 디코딩까지 끝난 이미지 수 (naturalWidth > 0) */
  loaded: number;
  /** 붙어 있는 `<img>` 수 (실패로 생략된 것은 제외) */
  mounted: number;
  attacker: string | null;
  victim: string | null;
}

export const cutinRuntime: CutinRuntime = {
  enabled: true,
  kind: null,
  visible: false,
  loaded: 0,
  mounted: 0,
  attacker: null,
  victim: null,
};

export function resetCutinRuntime(): void {
  cutinRuntime.kind = null;
  cutinRuntime.visible = false;
  cutinRuntime.loaded = 0;
  cutinRuntime.mounted = 0;
  cutinRuntime.attacker = null;
  cutinRuntime.victim = null;
}
