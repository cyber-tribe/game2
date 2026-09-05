import type { FactionId } from "../game/components";
import type { MatchEventType } from "../game/simulation";

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
  guardian: "{subject}がリーダーを守護者化した",
  armageddon: "{subject}が最終決戦を発動した",
  flood: "{subject}が洪水を起こした",
  houseCaptured: "{subject}が{opponent}の家を奪った",
  houseBurned: "{subject}が{opponent}の家を焼き払った",
  houseReachedCastle: "{subject}の家が城砦まで発展した",
};

/**
 * Formats a MatchEvent for display — shared by main.ts's enemy-action
 * message and Hud's post-game "戦いの記録" recap, so the two always
 * describe the same action the same way instead of drifting apart as
 * separate copies. No emoji prefix (see plan/0084-original-ui-foundation.md
 * — this project's OS-native emoji don't belong in a pixel-art world), and
 * "城砦" rather than the internal HouseLevel identifier "castle".
 *
 * e.g. describeMatchEvent("earthquake", "player") -> "あなたが地震を起こした",
 * describeMatchEvent("houseCaptured", "enemy") -> "敵があなたの家を奪った".
 */
export function describeMatchEvent(type: MatchEventType, faction: FactionId): string {
  const subject = faction === "player" ? "あなた" : "敵";
  const opponent = faction === "player" ? "敵" : "あなた";
  return MATCH_EVENT_TEMPLATE[type].replace("{subject}", subject).replace("{opponent}", opponent);
}

/** e.g. 75.3 -> "1:15". */
export function formatMatchTime(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
