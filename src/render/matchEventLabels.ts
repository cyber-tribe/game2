import type { FactionId } from "../game/components";
import type { MatchEventType } from "../game/simulation";

/** Icon shown before each event's description, shared by the toast and the recap (see describeMatchEvent). */
const MATCH_EVENT_EMOJI: Record<MatchEventType, string> = {
  shrineMove: "🚩",
  earthquake: "💥",
  swamp: "🐸",
  volcano: "🌋",
  knight: "⚔️",
  armageddon: "☠️",
  flood: "🌊",
  houseCaptured: "🏠",
  houseBurned: "🔥",
  houseReachedCastle: "🏰",
};

// "{subject}" is the faction that caused the event ("あなた"/"敵");
// "{opponent}" (only used by the house-vs-house events) is the other one —
// houseCaptured/houseBurned always name the other faction's house,
// regardless of who did the capturing/burning.
const MATCH_EVENT_TEMPLATE: Record<MatchEventType, string> = {
  shrineMove: "{subject}が集結地を移動した",
  earthquake: "{subject}が地震を起こした",
  swamp: "{subject}が沼を作った",
  volcano: "{subject}が火山を起こした",
  knight: "{subject}がリーダーを騎士化した",
  armageddon: "{subject}が最終決戦を発動した",
  flood: "{subject}が洪水を起こした",
  houseCaptured: "{subject}が{opponent}の家を奪った",
  houseBurned: "{subject}が{opponent}の家を焼き払った",
  houseReachedCastle: "{subject}の家がcastleまで発展した",
};

/**
 * Formats a MatchEvent for display — shared by main.ts's enemy-action
 * toast and Hud's post-game "戦いの記録" recap, so the two always describe
 * the same action the same way instead of drifting apart as separate
 * copies.
 *
 * e.g. describeMatchEvent("earthquake", "player") -> "💥 あなたが地震を起こした",
 * describeMatchEvent("houseCaptured", "enemy") -> "🏠 敵があなたの家を奪った".
 */
export function describeMatchEvent(type: MatchEventType, faction: FactionId): string {
  const subject = faction === "player" ? "あなた" : "敵";
  const opponent = faction === "player" ? "敵" : "あなた";
  const text = MATCH_EVENT_TEMPLATE[type].replace("{subject}", subject).replace("{opponent}", opponent);
  return `${MATCH_EVENT_EMOJI[type]} ${text}`;
}
