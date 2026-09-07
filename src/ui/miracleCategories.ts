import type { ToolMode } from "./toolbar";

/**
 * The original's own six schools of miracle — 「奇跡は『人・植物・地・気・
 * 火・水』の6系統に分かれる」 (docs/original-miracles.md).
 *
 * Not a filing convenience. game2 now has all 29 of the original's
 * miracles, and by the time the last of them went in, the panel was a wall
 * of 26 identically-shaped buttons in one grid — a player looking for 花
 * had to read every one of them. The original never showed them that way:
 * it showed one school at a time, five things at most, and that is what
 * these categories restore.
 */
export type MiracleCategory = "human" | "plant" | "earth" | "air" | "fire" | "water";

/** Category order and labels, as docs/original-miracles.md lists them. */
export const MIRACLE_CATEGORIES: readonly { id: MiracleCategory; label: string }[] = [
  { id: "human", label: "人" },
  { id: "plant", label: "植物" },
  { id: "earth", label: "地" },
  { id: "air", label: "気" },
  { id: "fire", label: "火" },
  { id: "water", label: "水" },
];

/**
 * The tools that are *not* filed under a school, because they are always
 * on the panel: the behaviour modes, 照会 (a free inspection, not a
 * miracle) and the terrain edits.
 *
 * 隆起/沈降 are the original's own #1 土地上下 and belong to 人 by the
 * original's reckoning, but they are also the core loop this whole game
 * is built on — "平地を作る" is what a player does between every other
 * decision. Putting them a school-tap away would tax the single most
 * repeated action in the game to tidy up a panel. 平坦化 joins them for
 * the same reason (it is game2's own shortcut for the same job).
 */
export const ALWAYS_VISIBLE_TOOLS: readonly ToolMode[] = ["inspect", "raise", "lower", "flatten"];

/**
 * Which school each miracle belongs to.
 *
 * Straight from docs/original-miracles.md's own tables, including the one
 * hero per school (ペルセウス 人, アドニス 植物, ヘラクレス 地,
 * オディッセウス 気, アキレス 火, ヘレン 水) — that pattern is the
 * original's, and keeping it is most of why these groupings are worth
 * having rather than any six buckets of five.
 *
 * game2's own two additions have to be placed by judgement, since the
 * original has nowhere for them: 守護者化 sits with ペルセウス in 人,
 * beside the baseline hero it is defined against.
 */
export const MIRACLE_CATEGORY: Record<Exclude<ToolMode, (typeof ALWAYS_VISIBLE_TOOLS)[number]>, MiracleCategory> = {
  // 人 — 土地上下/平坦化 are always visible above; マグネット移動 is 集結地移動.
  shrine: "human",
  perseus: "human",
  plague: "human",
  armageddon: "human",
  guardian: "human",
  // 植物
  forest: "plant",
  flower: "plant",
  swamp: "plant",
  fungus: "plant",
  adonis: "plant",
  // 地
  road: "earth",
  wall: "earth",
  earthquake: "earth",
  megalith: "earth",
  hercules: "earth",
  // 気
  lightning: "air",
  tornado: "air",
  storm: "air",
  odysseus: "air",
  hurricane: "air",
  // 火
  firePillar: "fire",
  fireRain: "fire",
  achilles: "fire",
  volcano: "fire",
  // 水 — 渦巻き has no button of its own: it is only ever born from a
  // 竜巻 that wanders into water (see systems/whirlpool.ts).
  reef: "water",
  holyWater: "water",
  helen: "water",
  tsunami: "water",
};

/** Every miracle of one school, in the order the panel lists them. */
export function miraclesInCategory(category: MiracleCategory): ToolMode[] {
  return (Object.entries(MIRACLE_CATEGORY) as [ToolMode, MiracleCategory][])
    .filter(([, id]) => id === category)
    .map(([tool]) => tool);
}
