import type { FactionId } from "../game/components";
import type { MatchEventType } from "../game/simulation";

/**
 * Icon and Japanese verb phrase for each miracle a MatchEvent can record —
 * shared by main.ts's enemy-action toast and Hud's post-game "戦いの記録"
 * recap, so the two always describe the same action the same way instead
 * of drifting apart as separate copies.
 */
const MIRACLE_EVENT_EMOJI: Record<MatchEventType, string> = {
  shrineMove: "🚩",
  earthquake: "💥",
  swamp: "🐸",
  volcano: "🌋",
  knight: "⚔️",
  armageddon: "☠️",
  flood: "🌊",
};

const MIRACLE_EVENT_VERB: Record<MatchEventType, string> = {
  shrineMove: "集結地を移動した",
  earthquake: "地震を起こした",
  swamp: "沼を作った",
  volcano: "火山を起こした",
  knight: "リーダーを騎士化した",
  armageddon: "最終決戦を発動した",
  flood: "洪水を起こした",
};

/** e.g. describeMiracleEvent("earthquake", "player") -> "💥 あなたが地震を起こした". */
export function describeMiracleEvent(type: MatchEventType, faction: FactionId): string {
  const subject = faction === "player" ? "あなた" : "敵";
  return `${MIRACLE_EVENT_EMOJI[type]} ${subject}が${MIRACLE_EVENT_VERB[type]}`;
}
