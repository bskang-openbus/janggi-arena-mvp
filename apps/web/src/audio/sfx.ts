/**
 * SFX 카탈로그 (P6) — 전부 Web Audio 합성, 외부 파일 0개.
 *
 * 설계 원칙: 서로 다른 사운드는 **엔벨로프와 주파수 분포**로 구분한다.
 * 볼륨만 다른 같은 소리는 플레이어가 구분하지 못한다.
 *
 * 아래 수치는 `renderSfxOffline`(OfflineAudioContext, 48kHz)로 뽑은 파형을
 * 2ms RMS 엔벨로프 + 4096점 해닝 FFT로 실측한 값이다. 파라미터를 바꾸면
 * 같은 방법으로 다시 재면 된다.
 *
 *   id                 peak   atk(ms) 길이(ms) centroid  sub/low/mid/high/air %
 *   ─────────────────────────────────────────────────────────────────────────
 *   ui.hover           0.044     6       40     3860Hz   0/0/30/47/22
 *   ui.click           0.040     6       74     1960Hz   1/44/24/21/10
 *   piece.select       0.214    10      662     1082Hz   0/17/61/21/1
 *   piece.move  딱     0.143     8       66     1602Hz   4/61/12/12/10
 *   piece.deny  둔탁   0.151    10      156      232Hz  59/32/6/2/0
 *   cine.sigil         0.169   270      668     1308Hz  22/31/29/11/7
 *   cine.impact 쿵     0.611    14      270     4179Hz  19/31/10/13/27
 *   cine.dissolve      0.124    66      606    10915Hz   0/3/11/15/71
 *   alert.check        0.221    32      858      680Hz  15/36/42/6/1
 *   victory     팡파레 0.307   722     2510     1624Hz   5/52/27/8/8
 *
 * 세 타악의 구분 근거 (엔벨로프·대역이 서로 겹치지 않는다):
 *   딱   = 저역(100~400Hz) 61%, 서브 4%, 66ms.  가볍고 짧다
 *   둔탁 = 서브 59%, 1.5kHz 이상 2%, 156ms.     고역이 아예 없어 "막힌" 소리
 *   쿵   = 서브 19% + 초고역 27%(양 끝단이 동시에 = 파열), 270ms,
 *          진폭이 딱의 4.3배. 연출의 정점이므로 유일하게 0.6을 넘는다
 *   팡파레 = 어택 722ms · 길이 2.5s. 타악과 시간 스케일 자체가 다르다
 *
 * `bus`는 카테고리 믹스 레벨이다. UI는 게임 내내 반복되므로 가장 낮게,
 * 연출은 화면을 독점하는 순간이므로 가장 높게 잡는다.
 */
import { bell, noise, type Patch, tone } from "./synth";

export type SfxBus = "ui" | "game" | "cine";

export interface SfxDef {
  /** 보이스가 점유하는 시간(초). 정리 타이머와 오프라인 렌더 길이에 쓰인다 */
  dur: number;
  bus: SfxBus;
  /** 한 줄 설계 근거 (보고·디버그용) */
  note: string;
  render(p: Patch): void;
}

/* ------------------------------------------------------------------ */
/* 전통 5음계 — 평조(平調) 계열, 황종을 C로 잡는다                       */
/* ------------------------------------------------------------------ */

/** 궁(宮)·상(商)·각(角)·치(徵)·우(羽) = C D F G A. 3음이 없어 개방적이다. */
export const PENTATONIC = {
  gung: 261.63, // C4
  sang: 293.66, // D4
  gak: 349.23, // F4
  chi: 392.0, // G4
  u: 440.0, // A4
} as const;

/* ------------------------------------------------------------------ */
/* 카탈로그                                                            */
/* ------------------------------------------------------------------ */

export const SFX = {
  /* ── UI ─────────────────────────────────────────────────────── */

  "ui.hover": {
    dur: 0.1,
    bus: "ui",
    note: "2.6kHz 밴드패스 12ms — 귀에 걸리지 않는 최소 틱",
    render(p) {
      noise(p, { freq: 2600, q: 8, a: 0.0008, d: 0.05, gain: 0.72 });
      tone(p, { freq: 1320, type: "sine", a: 0.001, d: 0.045, gain: 0.16 });
    },
  },

  "ui.click": {
    dur: 0.22,
    bus: "ui",
    note: "목판 톡 — 1150/2380/4100Hz 비정수배 모드 + 232→210Hz 몸통, 75ms 감쇠",
    render(p) {
      // 나무 타악기는 부분음이 비정수배이고 전부 100ms 안에 죽는다
      noise(p, { freq: 1150, q: 11, a: 0.001, d: 0.075, gain: 0.72, layer: 0 });
      noise(p, { freq: 2380, q: 14, a: 0.001, d: 0.045, gain: 0.42, layer: 1 });
      // 치음은 밴드패스로 잡아 둔다 — 하이패스로 열어 두면 5kHz 위가 절반을
      // 차지해 "톡"이 아니라 "칫"으로 들린다 (오프라인 측정: air 43% → 12%)
      noise(p, { freq: 4100, q: 6, a: 0.0006, d: 0.022, gain: 0.2, layer: 2 });
      tone(p, {
        freq: 232,
        freqTo: 208,
        type: "triangle",
        a: 0.002,
        d: 0.09,
        gain: 0.2,
      });
    },
  },

  /* ── 대국 조작 ───────────────────────────────────────────────── */

  "piece.select": {
    dur: 1.15,
    bus: "game",
    note: "맑은 종지음 — 784Hz(G5) 종 부분음 0.5/1/2/2.76/5.4배, 0.86s 링",
    render(p) {
      bell(p, { freq: 784, gain: 0.42, ring: 1, strike: 0.2 });
    },
  },

  "piece.move": {
    dur: 0.32,
    bus: "game",
    note: "장기알 딱 — 3kHz 접촉음 14ms + 430/810/1640Hz 목판 공명 + 148Hz 몸통",
    render(p) {
      // 1) 알과 판이 부딪는 순간의 접촉 트랜지언트 (이게 '딱'의 정체).
      //    밴드패스로 3kHz 근방만 남긴다 — 하이패스로 열면 초고역이 절반을
      //    차지해 나무가 아니라 유리처럼 들린다 (오프라인 측정: air 52% → 20%)
      noise(p, { freq: 3000, q: 1.2, a: 0.0005, d: 0.016, gain: 0.42, layer: 0 });
      // 2) 나무 판이 울리는 공명 — Q가 높아 음정감이 살짝 생긴다
      noise(p, { freq: 430, q: 13, a: 0.001, d: 0.13, gain: 1.05, layer: 1 });
      noise(p, { freq: 810, q: 10, a: 0.001, d: 0.085, gain: 0.58, layer: 2 });
      noise(p, { freq: 1640, q: 8, a: 0.001, d: 0.05, gain: 0.2, layer: 3 });
      // 3) 판 전체가 먹는 짧은 저역. 서브까지 내려가지 않는 게 핵심
      tone(p, {
        freq: 148,
        freqTo: 108,
        type: "sine",
        a: 0.002,
        d: 0.075,
        gain: 0.62,
      });
    },
  },

  "piece.deny": {
    dur: 0.34,
    bus: "game",
    note: "비합법 — 300Hz 로우패스 + 96→72Hz, 5ms 어택. 1kHz 이상 성분 없음",
    render(p) {
      noise(p, {
        type: "lowpass",
        freq: 300,
        q: 0.7,
        a: 0.005,
        d: 0.17,
        gain: 0.5,
        layer: 4,
      });
      tone(p, {
        freq: 96,
        freqTo: 72,
        type: "sine",
        a: 0.006,
        d: 0.2,
        gain: 0.5,
      });
    },
  },

  "game.pass": {
    dur: 0.36,
    bus: "game",
    note: "한수쉼 — 620Hz 목판 두 번 두드림 (90ms 간격), 결정이 아님을 알린다",
    render(p) {
      for (const [i, delay] of [0, 0.09].entries()) {
        noise(p, {
          freq: 620,
          q: 7,
          a: 0.0015,
          d: 0.09,
          gain: 0.46,
          delay,
          layer: 5 + i,
        });
        tone(p, {
          freq: 190,
          type: "triangle",
          a: 0.003,
          d: 0.07,
          gain: 0.14,
          delay,
        });
      }
    },
  },

  /* ── 연출 (docs/SCENES.md 2절 타임라인) ──────────────────────── */

  "cine.sigil": {
    dur: 0.95,
    bus: "cine",
    note: "소환진 0.3s — 55Hz 비팅 드론(280ms 스웰) + 165→1320Hz 상승 스윕",
    render(p) {
      // 저음 웅웅: 0.4Hz로 맥놀이하도록 두 톱니를 디튠 → 정지된 화음이 아니라
      // "살아 있는" 울림이 된다
      for (const [i, freq] of [55, 55.4].entries()) {
        tone(p, {
          freq,
          type: "sawtooth",
          lp: 900,
          a: 0.28,
          d: 0.5,
          gain: 0.24,
          delay: i * 0.01,
        });
      }
      // 상승 스윕 — 소환진이 펼쳐지며 올라오는 부분
      tone(p, {
        freq: 165,
        freqTo: 1320,
        type: "triangle",
        glide: 0.5,
        a: 0.06,
        d: 0.36,
        gain: 0.24,
      });
      // 공기 시머: 필터 중심이 같이 올라간다
      noise(p, {
        freq: 700,
        freqTo: 3800,
        sweep: 0.6,
        q: 3,
        a: 0.25,
        d: 0.35,
        gain: 0.2,
        layer: 8,
      });
    },
  },

  "cine.impact": {
    dur: 0.8,
    bus: "cine",
    note: "타격 1.2s — 0.5ms 파열(2.2kHz HP) + 900→300Hz 크래시 + 180→44Hz 펀치 + 55Hz 서브",
    render(p) {
      // 0.5ms 어택이 '팡'을, 44Hz까지 떨어지는 펀치가 '쿵'을 만든다.
      noise(p, {
        type: "highpass",
        freq: 2200,
        a: 0.0005,
        d: 0.05,
        gain: 0.8,
        layer: 9,
      });
      noise(p, {
        freq: 900,
        freqTo: 300,
        sweep: 0.3,
        q: 0.9,
        a: 0.002,
        d: 0.3,
        gain: 0.55,
        layer: 10,
      });
      tone(p, {
        freq: 180,
        freqTo: 44,
        type: "sine",
        glide: 0.16,
        a: 0.002,
        d: 0.28,
        gain: 0.95,
      });
      tone(p, { freq: 55, type: "sine", a: 0.004, d: 0.42, gain: 0.34 });
    },
  },

  "cine.dissolve": {
    dur: 1.05,
    bus: "cine",
    note: "디졸브 1.5s — 트랜지언트 없음(90ms 어택), 260→3800Hz 상승 밴드패스 = 재가 흩어지는 슈우웅",
    render(p) {
      // 스펙트럼 중심이 0.72초에 걸쳐 위로 빠져나간다 = 물질이 흩어진다
      noise(p, {
        freq: 260,
        freqTo: 3800,
        sweep: 0.72,
        q: 1.1,
        a: 0.09,
        d: 0.62,
        gain: 0.75,
        layer: 11,
      });
      noise(p, {
        type: "highpass",
        freq: 400,
        freqTo: 4200,
        sweep: 0.7,
        a: 0.15,
        d: 0.6,
        gain: 0.17,
        layer: 12,
      });
      // 몸통이 가라앉는 반대 방향의 선
      tone(p, {
        freq: 620,
        freqTo: 130,
        type: "sine",
        glide: 0.8,
        a: 0.06,
        d: 0.7,
        gain: 0.12,
      });
    },
  },

  "alert.check": {
    dur: 1.2,
    bus: "cine",
    note: "장군 — 233/330Hz 트라이톤(√2 비율) + 6Hz 트레몰로 + 58Hz 스웰",
    render(p) {
      // 트라이톤은 서양·동양 어느 조성에도 안 얹히는 유일한 음정이라
      // 그 자체로 '불안'을 뜻한다. 6Hz 트레몰로가 심박처럼 흔든다.
      for (const [i, freq] of [233.08, 329.63].entries()) {
        tone(p, {
          freq,
          type: "sawtooth",
          lp: 900,
          a: 0.012,
          d: 0.8,
          gain: 0.3,
          tremolo: [0.12, 6],
          delay: i * 0.02,
        });
      }
      noise(p, {
        freq: 220,
        q: 3,
        a: 0.002,
        d: 0.2,
        gain: 0.34,
        layer: 13,
      });
      tone(p, { freq: 58, type: "sine", a: 0.25, d: 0.7, gain: 0.22 });
    },
  },

  "victory.fanfare": {
    dur: 3.5,
    bus: "cine",
    note: "외통 — 평조 5음계 궁·각·치·궁' 아르페지오(160ms 간격) → 130.8Hz 대종 + 개방 5도 화음 2.4s",
    render(p) {
      // 1) 5음계 아르페지오. 3음이 없는 개방 진행이라 장·단조로 들리지 않는다
      const motif = [
        PENTATONIC.gung,
        PENTATONIC.gak,
        PENTATONIC.chi,
        PENTATONIC.gung * 2,
      ];
      motif.forEach((freq, i) => {
        bell(p, {
          freq,
          gain: 0.3,
          ring: 0.55,
          strike: 0.22,
          delay: i * 0.16,
        });
      });
      // 2) 대종(大鐘) 일격 — 궁의 두 옥타브 아래
      bell(p, { freq: 130.81, gain: 0.46, ring: 2.6, strike: 0.3, delay: 0.7 });
      // 3) 개방 화음(궁-치-궁') 지속. 팡파레의 '펼쳐짐'
      for (const [i, freq] of [
        PENTATONIC.gung,
        PENTATONIC.chi,
        PENTATONIC.gung * 2,
      ].entries()) {
        tone(p, {
          freq,
          type: "triangle",
          lp: 2400,
          a: 0.25,
          hold: 0.35,
          d: 1.7,
          gain: 0.13,
          delay: 0.75 + i * 0.03,
        });
      }
      // 4) 금속 시머
      noise(p, {
        freq: 1200,
        freqTo: 4200,
        sweep: 0.9,
        q: 2,
        a: 0.12,
        d: 0.9,
        gain: 0.16,
        delay: 0.7,
        layer: 14,
      });
    },
  },

  /* ── Tier 2 공격 구간 0.8s (docs/SCENES.md 3절) ───────────────── */

  "cine.atk.spear": {
    dur: 0.45,
    bus: "cine",
    note: "창격 — 900→4200Hz 얇은 휙(220ms) + 2.6/3.9kHz 금속 핑. 저역 없음 = 찌르기",
    render(p) {
      noise(p, {
        freq: 900,
        freqTo: 4200,
        sweep: 0.16,
        q: 2.4,
        a: 0.02,
        d: 0.22,
        gain: 0.6,
        layer: 15,
      });
      tone(p, { freq: 2600, type: "sine", a: 0.001, d: 0.12, gain: 0.14, delay: 0.13 });
      tone(p, { freq: 3900, type: "sine", a: 0.001, d: 0.08, gain: 0.08, delay: 0.13 });
    },
  },

  "cine.atk.charge": {
    dur: 0.5,
    bus: "cine",
    note: "돌진 참격 — 350→2400Hz 넓은 휙(300ms, Q=1.2) + 4kHz 슬래시. 창격보다 무겁다",
    render(p) {
      noise(p, {
        freq: 350,
        freqTo: 2400,
        sweep: 0.26,
        q: 1.2,
        a: 0.05,
        d: 0.3,
        gain: 1.0,
        layer: 16,
      });
      // 슬래시는 밴드패스 — 하이패스면 초고역이 68%를 먹어 '휙'이 쉿소리가 된다
      noise(p, {
        freq: 4000,
        q: 2.4,
        a: 0.002,
        d: 0.09,
        gain: 0.32,
        delay: 0.22,
        layer: 17,
      });
    },
  },

  "cine.atk.bombard": {
    dur: 0.5,
    bus: "cine",
    note: "포격 — 1500→520Hz 하강 휘슬 + 5Hz 비브라토. 포탄이 포물선을 그리며 떨어진다",
    render(p) {
      tone(p, {
        freq: 1500,
        freqTo: 520,
        type: "sine",
        glide: 0.36,
        a: 0.03,
        d: 0.3,
        gain: 0.3,
        vibrato: [28, 5],
      });
      // 발사 순간의 포문 압력
      noise(p, {
        type: "lowpass",
        freq: 500,
        a: 0.002,
        d: 0.12,
        gain: 0.3,
        layer: 18,
      });
    },
  },

  "cine.atk.leap": {
    dur: 0.46,
    bus: "cine",
    note: "도약 강습 — 300→1500Hz 상승 휙 + 220→780Hz 상승선. 상승 = 떠오름",
    render(p) {
      noise(p, {
        freq: 300,
        freqTo: 1500,
        sweep: 0.3,
        q: 1.6,
        a: 0.04,
        d: 0.24,
        gain: 0.6,
        layer: 19,
      });
      tone(p, {
        freq: 220,
        freqTo: 780,
        type: "triangle",
        glide: 0.3,
        a: 0.03,
        d: 0.26,
        gain: 0.18,
      });
    },
  },

  "cine.atk.stomp": {
    dur: 0.55,
    bus: "cine",
    note: "진각 — 130→42Hz 저음 쿵(300ms 글라이드) + 160Hz 로우패스 럼블",
    render(p) {
      tone(p, {
        freq: 130,
        freqTo: 42,
        type: "sine",
        glide: 0.3,
        a: 0.003,
        d: 0.4,
        gain: 0.8,
      });
      noise(p, {
        type: "lowpass",
        freq: 160,
        q: 0.8,
        a: 0.01,
        d: 0.35,
        gain: 0.38,
        layer: 20,
      });
    },
  },

  "cine.atk.wardblade": {
    dur: 0.55,
    bus: "cine",
    note: "호위검 — 1760/2350/3140Hz 금속 핑 3연(90ms 간격) + 12Hz 트레몰로 회전 노이즈",
    render(p) {
      [1760, 2350, 3140].forEach((freq, i) => {
        tone(p, {
          freq,
          type: "triangle",
          a: 0.0015,
          d: 0.16,
          gain: 0.2,
          delay: i * 0.09,
        });
      });
      noise(p, {
        freq: 1800,
        q: 5,
        a: 0.03,
        d: 0.35,
        gain: 0.2,
        tremolo: [0.5, 12],
        layer: 21,
      });
    },
  },

  "cine.atk.royal": {
    dur: 0.65,
    bus: "cine",
    note: "왕의 위엄 — 116.5Hz 저음 종 + 58Hz 스웰. 유일하게 '치는' 대신 '울리는' 공격",
    render(p) {
      bell(p, { freq: 116.54, gain: 0.42, ring: 0.6, strike: 0.12 });
      tone(p, { freq: 58, type: "sine", a: 0.1, d: 0.4, gain: 0.3 });
    },
  },
} satisfies Record<string, SfxDef>;

export type SfxId = keyof typeof SFX;

/** 카테고리 믹스 레벨. UI는 가장 자주 울리므로 가장 낮다. */
export const BUS_GAIN: Record<SfxBus, number> = {
  ui: 0.38,
  game: 0.52,
  cine: 0.78,
};

/**
 * Tier 2 공격 변주 id → 사운드.
 *
 * 7종의 실측 스펙트럼 중심(centroid)이 서로 벌어져 있어 같은 타격 앞에서도
 * 어느 기물이 쳤는지 귀로 구분된다:
 *   stomp 137Hz · royal 184Hz · bombard 1282Hz · leap 2770Hz ·
 *   spear 3815Hz · wardblade 4253Hz · charge 4523Hz
 * (stomp/royal은 저역 98%, spear/wardblade는 1.5kHz 이상 73~87%)
 *
 * `lunge`(P3 기본 전방 돌진)는 차의 돌진음을 공용으로 쓴다 — 공통 타격음
 * 재사용은 허용 범위이고, 매핑되지 않은 변주가 생겨도 무음이 되지 않는다.
 */
const ATTACK_SFX: Record<string, SfxId> = {
  lunge: "cine.atk.charge",
  spear: "cine.atk.spear",
  charge: "cine.atk.charge",
  bombard: "cine.atk.bombard",
  leap: "cine.atk.leap",
  stomp: "cine.atk.stomp",
  wardblade: "cine.atk.wardblade",
  royal: "cine.atk.royal",
};

export function attackSfxFor(variantId: string | null | undefined): SfxId {
  return (variantId && ATTACK_SFX[variantId]) || "cine.atk.charge";
}
