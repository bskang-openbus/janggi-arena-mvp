/**
 * Tier 2 기물별 고유 연출 등록 (P4, docs/SCENES.md 3절).
 *
 * Importing this module is what fills the P3 extension slot: each variant
 * replaces only the 0.8s~1.2s attack window of the common timeline, so the
 * darkening, the framing, the hitstop, the dissolve, the input lock and the
 * skip are shared by all seven and defined exactly once.
 *
 * `JanggiScene` imports this for its side effect, which happens well before a
 * move can be played. `variantIdFor` falls back to 전방 돌진 if a type is ever
 * left unmapped, so a missing registration degrades instead of breaking.
 */
import { PIECE_VARIANT, registerAttackVariant } from "../attackVariants";
import { bombard } from "./bombard";
import { charge } from "./charge";
import { leap } from "./leap";
import { royal } from "./royal";
import { spear } from "./spear";
import { stomp } from "./stomp";
import { wardblade } from "./wardblade";

for (const variant of [spear, charge, bombard, leap, stomp, wardblade, royal]) {
  registerAttackVariant(variant);
}

PIECE_VARIANT.soldier = spear.id; // 졸·병 — 창격
PIECE_VARIANT.chariot = charge.id; // 차   — 돌진 참격
PIECE_VARIANT.cannon = bombard.id; // 포   — 포격
PIECE_VARIANT.horse = leap.id; // 마   — 도약 강습
PIECE_VARIANT.elephant = stomp.id; // 상   — 진각 내려찍기
PIECE_VARIANT.guard = wardblade.id; // 사   — 호위검
PIECE_VARIANT.general = royal.id; // 궁   — 왕의 위엄

export { bombard, charge, leap, royal, spear, stomp, wardblade };
