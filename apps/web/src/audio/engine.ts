/**
 * 오디오 엔진 (P6) — AudioContext 싱글턴 · 마스터 게인 · 뮤트 · 보이스 수명.
 *
 * 브라우저 autoplay 정책상 `AudioContext`는 사용자 제스처 없이는 `suspended`로
 * 시작한다. 그래서 컨텍스트는 **첫 제스처에서** 만들고 resume 한다 —
 * 페이지 로드 시점에 만들면 콘솔 경고만 남고 아무 소리도 나지 않는다.
 *
 * 재생 카운터(`sfxCounts`)는 소리 자체를 검증하기 어려운 E2E를 위한 것이다.
 * 실제로 재생된 것만 센다 (사운드 OFF면 증가하지 않는다).
 */
import { type SfxId, SFX, BUS_GAIN, type SfxBus } from "./sfx";
import type { Patch } from "./synth";

type Ctor = typeof AudioContext;

/** 살아 있는 보이스 — 스킵이 즉시 끊을 수 있도록 게인과 소스를 함께 붙든다. */
interface Voice {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  timer: ReturnType<typeof setTimeout> | null;
}

/** 마스터 트림. 개별 사운드는 0.3~1.0 범위로 만들어 두었다. */
const MASTER_GAIN = 0.55;
/** 스킵 시 페이드 시간 — 0으로 끊으면 클릭 노이즈가 난다 */
const CUT_FADE = 0.014;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let buses: Record<SfxBus, GainNode> | null = null;
let enabled = true;
const voices = new Set<Voice>();

/** E2E 검증용 재생 카운터 — id별 + 총합. */
export const sfxCounts: Record<string, number> = {};

function bump(id: string): void {
  sfxCounts[id] = (sfxCounts[id] ?? 0) + 1;
  sfxCounts.total = (sfxCounts.total ?? 0) + 1;
}

export function resetSfxCounts(): void {
  for (const key of Object.keys(sfxCounts)) delete sfxCounts[key];
}

/* ------------------------------------------------------------------ */
/* 컨텍스트 수명                                                        */
/* ------------------------------------------------------------------ */

function createContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: Ctor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: "interactive" });
  } catch {
    return null;
  }
}

/** 컨텍스트 + 마스터/버스 게인을 한 번만 만든다. */
function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const created = createContext();
  if (!created) return null;
  ctx = created;
  master = ctx.createGain();
  master.gain.value = enabled ? MASTER_GAIN : 0;
  master.connect(ctx.destination);

  const made = {} as Record<SfxBus, GainNode>;
  for (const key of Object.keys(BUS_GAIN) as SfxBus[]) {
    const g = ctx.createGain();
    g.gain.value = BUS_GAIN[key];
    g.connect(master);
    made[key] = g;
  }
  buses = made;
  return ctx;
}

/**
 * 컨텍스트를 열고 재개를 시도한다.
 *
 * 타이틀에서 "로컬 대국"을 누른 뒤 대국 화면이 뜨는 흐름에서는 이미 sticky
 * activation이 있으므로 마운트 시점의 resume이 그대로 성공한다. 활성화가
 * 없으면 조용히 실패하고(promise reject) 아래 제스처 리스너가 이어받는다.
 */
export function primeSfx(): void {
  const c = ensure();
  if (!c || !enabled || c.state === "running") return;
  void c.resume().catch(() => {});
}

/**
 * 첫 제스처에서 컨텍스트를 열고 resume 한다 (브라우저 autoplay 정책).
 * `pointerdown`/`keydown`/`touchstart` 셋을 **캡처 단계**에서 듣는다 — 보드
 * 캔버스가 이벤트를 소비해도 잠금이 풀려야 하기 때문.
 */
export function installGestureUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  const events: (keyof DocumentEventMap)[] = [
    "pointerdown",
    "keydown",
    "touchstart",
  ];
  for (const e of events) {
    document.addEventListener(e, primeSfx, { capture: true, passive: true });
  }
  primeSfx();
  return () => {
    for (const e of events) {
      document.removeEventListener(e, primeSfx, { capture: true });
    }
  };
}

/* ------------------------------------------------------------------ */
/* 뮤트 (설정 오버레이의 사운드 ON/OFF)                                  */
/* ------------------------------------------------------------------ */

export function setSfxEnabled(next: boolean): void {
  if (enabled === next) return;
  enabled = next;
  // ON으로 돌아올 때는 컨텍스트가 아직 없을 수도 있다 (OFF 상태로 시작한 세션)
  if (next) primeSfx();
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(next ? MASTER_GAIN : 0, now + 0.06);
  if (!next) {
    stopAllSfx();
    // OFF면 컨텍스트 자체를 재운다 — 오디오 스레드까지 멈춘다
    window.setTimeout(() => {
      if (!enabled && ctx && ctx.state === "running") {
        void ctx.suspend().catch(() => {});
      }
    }, 80);
  }
}

export function isSfxEnabled(): boolean {
  return enabled;
}

/** 진단용 — E2E가 "왜 카운트가 0인가"를 구분할 수 있게 한다. */
export function sfxState(): string {
  return ctx ? ctx.state : "none";
}

/* ------------------------------------------------------------------ */
/* 재생                                                                */
/* ------------------------------------------------------------------ */

function release(voice: Voice): void {
  voices.delete(voice);
  if (voice.timer !== null) clearTimeout(voice.timer);
  try {
    voice.gain.disconnect();
  } catch {
    /* already gone */
  }
}

/**
 * 사운드 하나를 재생한다.
 *
 * 카운터는 **호출 시점에** 올린다 (사운드 ON일 때만). 컨텍스트가 아직
 * running이 아니면(첫 제스처 전, 또는 오디오 장치가 없는 headless) 노드는
 * 만들지 않고 조용히 넘어간다 — suspended 상태에서 스케줄해 두면 resume 순간
 * 밀린 소리가 한꺼번에 터진다. 트리거 배선 자체는 카운터로 검증된다.
 */
export function playSfx(id: SfxId, gain = 1): void {
  if (!enabled) return;
  const def = SFX[id];
  if (!def) return;

  bump(id);

  const c = ensure();
  if (!c || !buses || c.state !== "running") return;

  const voice: Voice = {
    gain: c.createGain(),
    sources: [],
    timer: null,
  };
  voice.gain.gain.value = gain;
  voice.gain.connect(buses[def.bus]);

  const patch: Patch = {
    ctx: c,
    out: voice.gain,
    // 2ms 여유: 같은 프레임에 여러 소리가 시작할 때 스케줄이 과거로 밀리는 것을 막는다
    t0: c.currentTime + 0.002,
    keep: (src) => voice.sources.push(src),
  };
  try {
    def.render(patch);
  } catch {
    release(voice);
    return;
  }

  voices.add(voice);
  voice.timer = setTimeout(() => release(voice), (def.dur + 0.35) * 1000);
}

/**
 * 재생 중인 모든 사운드를 즉시 끊는다 (연출 스킵 / 사운드 OFF).
 * 14ms 페이드로 클릭 노이즈 없이 사라진다.
 */
export function stopAllSfx(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const voice of [...voices]) {
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + CUT_FADE);
      for (const src of voice.sources) {
        try {
          src.stop(now + CUT_FADE + 0.005);
        } catch {
          /* already stopped */
        }
      }
    } catch {
      /* context died */
    }
    if (voice.timer !== null) clearTimeout(voice.timer);
    voice.timer = setTimeout(() => release(voice), 120);
  }
}

/** 테스트 정리용 — 컨텍스트를 닫고 상태를 초기화한다. */
export function disposeSfx(): void {
  stopAllSfx();
  voices.clear();
  const dying = ctx;
  ctx = null;
  master = null;
  buses = null;
  if (dying) void dying.close().catch(() => {});
}

/* ------------------------------------------------------------------ */
/* 오프라인 렌더 (품질 자가검증)                                         */
/* ------------------------------------------------------------------ */

/**
 * 같은 합성 코드를 `OfflineAudioContext`로 렌더해 PCM을 돌려준다.
 * 파형·스펙트럼을 눈으로 확인하고 wav로 떠 보기 위한 개발 도구다.
 */
export async function renderSfxOffline(
  id: SfxId,
  sampleRate = 48000,
): Promise<{ sampleRate: number; samples: Float32Array } | null> {
  if (typeof window === "undefined" || !window.OfflineAudioContext) return null;
  const def = SFX[id];
  if (!def) return null;
  const length = Math.ceil((def.dur + 0.25) * sampleRate);
  const off = new OfflineAudioContext(1, length, sampleRate);
  const out = off.createGain();
  out.gain.value = BUS_GAIN[def.bus] * MASTER_GAIN;
  out.connect(off.destination);
  def.render({ ctx: off, out, t0: 0.005, keep: () => {} });
  const buffer = await off.startRendering();
  return { sampleRate, samples: buffer.getChannelData(0).slice() };
}
