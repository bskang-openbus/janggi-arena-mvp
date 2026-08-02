/**
 * Web Audio 합성 프리미티브 (P6).
 *
 * CLAUDE.md 1절 3항: 외부 사운드 에셋 0개. 모든 소리는 여기 있는 네 가지
 * 재료만으로 만들어진다 — 오실레이터, 노이즈 버퍼, 바이쿼드 필터, 게인 엔벨로프.
 *
 * 모든 함수는 `BaseAudioContext`를 받으므로 실시간 `AudioContext`와
 * `OfflineAudioContext`(품질 자가검증용 오프라인 렌더) 양쪽에서 동일하게 돈다.
 */

/** Deterministic PRNG — 오프라인 렌더가 실행마다 같은 파형이어야 한다. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 한 사운드를 그리는 데 필요한 문맥.
 *
 * `out`은 그 사운드 전용 게인 노드다 (voice gain) — 연출 스킵 시 이 노드
 * 하나만 0으로 눕히면 해당 사운드가 즉시 사라진다.
 */
export interface Patch {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** 사운드가 시작하는 절대 컨텍스트 시각 */
  t0: number;
  /** 스킵이 잘라낼 수 있도록 소스를 등록한다 */
  keep: (src: AudioScheduledSourceNode) => void;
}

/* ------------------------------------------------------------------ */
/* 노이즈 버퍼 (컨텍스트당 1회 생성 후 재사용)                          */
/* ------------------------------------------------------------------ */

const NOISE_SECONDS = 2;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rnd = mulberry32(0x1a2b3c4d);
  for (let i = 0; i < length; i += 1) data[i] = rnd() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

/**
 * 레이어마다 노이즈 버퍼의 다른 지점을 읽게 해 같은 소리에서도 층이 겹쳐
 * 들리지 않게 한다. 파라미터에서 유도하므로 재생마다 재현 가능하다.
 */
function noiseOffset(freq: number, index: number): number {
  const h = (freq * 0.0173 + index * 0.317) % 1;
  return (h < 0 ? h + 1 : h) * (NOISE_SECONDS - 0.6);
}

/* ------------------------------------------------------------------ */
/* 엔벨로프                                                            */
/* ------------------------------------------------------------------ */

export interface Env {
  /** attack — 0에서 peak까지 (초). 타악은 0.5~3ms, 스웰은 100ms+ */
  a?: number;
  /** 유지 구간 (초) */
  hold?: number;
  /** exponential decay — peak에서 -80dB까지 (초) */
  d?: number;
  /** peak 진폭 (0..1) */
  gain?: number;
  /** 사운드 시작으로부터의 지연 (초) */
  delay?: number;
}

const MIN_ATTACK = 0.0004;

/** 선형 어택 + 지수 감쇠. 타악기의 자연스러운 형태이자 클릭 노이즈가 없다. */
export function applyEnv(param: AudioParam, t: number, env: Env): number {
  const a = Math.max(MIN_ATTACK, env.a ?? 0.002);
  const hold = Math.max(0, env.hold ?? 0);
  const d = Math.max(0.005, env.d ?? 0.1);
  const peak = Math.max(1e-4, env.gain ?? 0.5);
  const eps = peak * 1e-4;

  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) param.setValueAtTime(peak, t + a + hold);
  param.exponentialRampToValueAtTime(eps, t + a + hold + d);
  param.setValueAtTime(0, t + a + hold + d + 0.001);
  return a + hold + d + 0.002;
}

/* ------------------------------------------------------------------ */
/* 오실레이터 보이스                                                    */
/* ------------------------------------------------------------------ */

export interface ToneOpts extends Env {
  freq: number;
  /** 지수 피치 글라이드 목표 (스윕·펀치·휘슬) */
  freqTo?: number;
  /** 글라이드에 걸리는 시간. 기본값 = attack + decay */
  glide?: number;
  type?: OscillatorType;
  /** 로우패스 컷오프 (Hz) */
  lp?: number;
  /** 비브라토 [깊이(cents), 속도(Hz)] */
  vibrato?: [number, number];
  /** 진폭 트레몰로 [깊이 0..1, 속도(Hz)] */
  tremolo?: [number, number];
  /** 디튠 (cents) */
  detune?: number;
}

export function tone(p: Patch, o: ToneOpts): number {
  const { ctx } = p;
  const t = p.t0 + (o.delay ?? 0);
  const a = Math.max(MIN_ATTACK, o.a ?? 0.002);
  const d = Math.max(0.005, o.d ?? 0.1);
  const hold = Math.max(0, o.hold ?? 0);

  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(Math.max(1, o.freq), t);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  if (o.freqTo !== undefined) {
    const span = Math.max(0.01, o.glide ?? a + hold + d);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, o.freqTo),
      t + span,
    );
  }

  const amp = ctx.createGain();
  const span = applyEnv(amp.gain, t, o);

  let node: AudioNode = osc;
  if (o.lp !== undefined) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(o.lp, t);
    lp.Q.setValueAtTime(0.9, t);
    node.connect(lp);
    node = lp;
  }
  node.connect(amp);
  amp.connect(p.out);

  if (o.vibrato) {
    const [cents, hz] = o.vibrato;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(hz, t);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(cents, t);
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(t);
    lfo.stop(t + span + 0.02);
    p.keep(lfo);
  }
  if (o.tremolo) {
    const [depth, hz] = o.tremolo;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(hz, t);
    const scale = ctx.createGain();
    scale.gain.setValueAtTime(depth, t);
    lfo.connect(scale);
    scale.connect(amp.gain);
    lfo.start(t);
    lfo.stop(t + span + 0.02);
    p.keep(lfo);
  }

  osc.start(t);
  osc.stop(t + span + 0.02);
  p.keep(osc);
  return (o.delay ?? 0) + span;
}

/* ------------------------------------------------------------------ */
/* 노이즈 보이스                                                        */
/* ------------------------------------------------------------------ */

export interface NoiseOpts extends Env {
  /** 필터 종류. bandpass = 공명체(나무·금속), lowpass = 둔탁, highpass = 파열 */
  type?: BiquadFilterType;
  freq: number;
  /** 필터 스윕 목표 (Hz) — 슈우웅·휘슬의 정체 */
  freqTo?: number;
  /** 스윕 시간. 기본값 = attack + decay */
  sweep?: number;
  /** 공진 Q. 높을수록 "종/판" 같은 뚜렷한 음정감 */
  q?: number;
  /** 진폭 트레몰로 [깊이 0..1, 속도(Hz)] */
  tremolo?: [number, number];
  /** 노이즈 버퍼 읽기 지점을 흔드는 레이어 인덱스 */
  layer?: number;
}

export function noise(p: Patch, o: NoiseOpts): number {
  const { ctx } = p;
  const t = p.t0 + (o.delay ?? 0);
  const a = Math.max(MIN_ATTACK, o.a ?? 0.002);
  const d = Math.max(0.005, o.d ?? 0.1);
  const hold = Math.max(0, o.hold ?? 0);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? "bandpass";
  filter.frequency.setValueAtTime(Math.max(20, o.freq), t);
  filter.Q.setValueAtTime(o.q ?? 1, t);
  if (o.freqTo !== undefined) {
    const span = Math.max(0.01, o.sweep ?? a + hold + d);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(20, o.freqTo),
      t + span,
    );
  }

  const amp = ctx.createGain();
  const span = applyEnv(amp.gain, t, o);

  src.connect(filter);
  filter.connect(amp);
  amp.connect(p.out);

  if (o.tremolo) {
    const [depth, hz] = o.tremolo;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(hz, t);
    const scale = ctx.createGain();
    scale.gain.setValueAtTime(depth, t);
    lfo.connect(scale);
    scale.connect(amp.gain);
    lfo.start(t);
    lfo.stop(t + span + 0.02);
    p.keep(lfo);
  }

  src.start(t, noiseOffset(o.freq, o.layer ?? 0), span + 0.05);
  p.keep(src);
  return (o.delay ?? 0) + span;
}

/* ------------------------------------------------------------------ */
/* 조합 보이스                                                          */
/* ------------------------------------------------------------------ */

/**
 * 종(鐘) 보이스.
 *
 * 종은 하모닉이 아니다 — 실제 종의 부분음은 대략 hum(0.5) · prime(1) ·
 * tierce(2.0) · quint(2.76) · nominal(5.4) 비율에 놓이고, 높은 부분음일수록
 * 빨리 죽는다. 이 두 성질(비정수배 + 부분음별 차등 감쇠)이 "맑은 종지음"을
 * 만든다. 정수배 배음으로 쌓으면 오르간처럼 들려 버린다.
 */
const BELL_PARTIALS: [ratio: number, gain: number, decay: number][] = [
  [0.5, 0.26, 1.0], // hum
  [1.0, 1.0, 0.86],
  [2.0, 0.44, 0.5],
  [2.76, 0.3, 0.34],
  [5.4, 0.13, 0.17],
];

export interface BellOpts extends Env {
  freq: number;
  /** 부분음 감쇠 전체 배율 — 큰 종일수록 길다 */
  ring?: number;
  /** 타격 순간의 치음(chiff) 세기 */
  strike?: number;
}

export function bell(p: Patch, o: BellOpts): number {
  const ring = o.ring ?? 1;
  const g = o.gain ?? 0.5;
  const delay = o.delay ?? 0;
  let span = 0;
  for (const [ratio, weight, decay] of BELL_PARTIALS) {
    span = Math.max(
      span,
      tone(p, {
        freq: o.freq * ratio,
        type: "sine",
        a: ratio > 1 ? 0.002 : 0.006,
        d: decay * ring,
        gain: g * weight,
        delay,
      }),
    );
  }
  const strike = o.strike ?? 0.18;
  if (strike > 0) {
    noise(p, {
      type: "highpass",
      freq: Math.max(1200, o.freq * 5),
      a: 0.0006,
      d: 0.016,
      gain: g * strike,
      delay,
      layer: 7,
    });
  }
  return span;
}
