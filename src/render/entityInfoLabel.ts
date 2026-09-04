import { HOUSE_LEVEL_LABELS } from "../game/constants";
import type { WalkerState } from "../game/components";
import type { InspectableEntity } from "../game/simulation";

/** Japanese label for each WalkerState, for the "🔍 照会" 情報パネル (see describeInspectableEntity). */
const WALKER_STATE_LABELS: Record<WalkerState, string> = {
  seeking: "定住地を探索中",
  traveling: "移動中",
  fighting: "交戦中",
  knight: "騎士化済み",
};

/**
 * Formats an InspectableEntity for the "🔍 照会" 情報パネル (see
 * docs/game-system.md 11節's "任意のウォーカー・家を照会して人数／強さ／
 * 発達段階を確認できる"). Mirrors describeMatchEvent's "あなた"/"敵"
 * phrasing so every player-facing faction label in this game reads the
 * same way.
 *
 * e.g. describeInspectableEntity({kind: "walker", faction: "player", strength: 2.3, state: "seeking", ...})
 * -> "あなたのウォーカー 強さ2.3（定住地を探索中）"
 */
export function describeInspectableEntity(entity: InspectableEntity): string {
  const subject = entity.faction === "player" ? "あなた" : "敵";

  if (entity.kind === "walker") {
    return `${subject}のウォーカー 強さ${entity.strength.toFixed(1)}（${WALKER_STATE_LABELS[entity.state]}）`;
  }

  return `${subject}の${HOUSE_LEVEL_LABELS[entity.level]} 人口${Math.round(entity.population)}/${entity.capacity}`;
}
