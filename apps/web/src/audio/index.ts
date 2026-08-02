/**
 * P6 사운드 — Web Audio API 합성 SFX (외부 오디오 파일 0개).
 *
 *   engine.ts       AudioContext 싱글턴 · 마스터/버스 게인 · 뮤트 · 보이스 수명
 *   synth.ts        합성 프리미티브 (오실레이터 · 노이즈 · 필터 · 엔벨로프)
 *   sfx.ts          SFX 카탈로그 (id → 합성 레시피 + 설계 근거)
 *   SfxDirector.tsx 게임/연출 상태 → SFX 부착 (구독만, 기존 로직 무수정)
 */
export {
  isSfxEnabled,
  playSfx,
  primeSfx,
  renderSfxOffline,
  resetSfxCounts,
  setSfxEnabled,
  sfxCounts,
  sfxState,
  stopAllSfx,
} from "./engine";
export { attackSfxFor, BUS_GAIN, PENTATONIC, SFX, type SfxId } from "./sfx";
export { SfxDirector } from "./SfxDirector";
