import { isHeroState, type HeroKind, type WalkerState } from "./components";
import type { MiracleId } from "./worlds";

/**
 * The original's own six schools of miracle — 「奇跡は『人・植物・地・気・
 * 火・水』の6系統に分かれる」 (docs/original-miracles.md), each with one
 * hero of its own.
 *
 * Lives in game/ rather than ui/ because two very different things read
 * it: the panel shows one school at a time (see ui/miracleCategories.ts),
 * and each world's enemy god draws its miracles from one school (see
 * ENEMY_SIGNATURE_MIRACLE and systems/enemyMiracles.ts). Those two must
 * agree — a god described as 火 in the world select and casting 沼 would
 * be a lie the player could see.
 */
export type MiracleSchool = "human" | "plant" | "earth" | "air" | "fire" | "water";

/** The schools in the order docs/original-miracles.md lists them, with their labels. */
export const MIRACLE_SCHOOLS: readonly { id: MiracleSchool; label: string }[] = [
  { id: "human", label: "人" },
  { id: "plant", label: "植物" },
  { id: "earth", label: "地" },
  { id: "air", label: "気" },
  { id: "fire", label: "火" },
  { id: "water", label: "水" },
];

/**
 * Which school each miracle belongs to — straight from
 * docs/original-miracles.md's own tables, including the one hero per
 * school (ペルセウス 人, アドニス 植物, ヘラクレス 地, オディッセウス 気,
 * アキレス 火, ヘレン 水).
 *
 * game2's own two additions have to be placed by judgement, since the
 * original has nowhere for them: 守護者化 sits with ペルセウス in 人,
 * beside the baseline hero it is defined against. (隆起/沈降/平坦化 are
 * the original's #1 土地上下 and belong to 人 too, but they are not
 * MiracleIds — they are always available, gated only by terrainEditRule.)
 */
export const MIRACLE_SCHOOL: Record<MiracleId, MiracleSchool> = {
  // 人 — マグネット移動 is 集結地移動.
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
  // 水
  reef: "water",
  whirlpool: "water",
  holyWater: "water",
  helen: "water",
  tsunami: "water",
};

/** Every miracle of one school, in the order MIRACLE_SCHOOL declares them. */
export function miraclesOfSchool(school: MiracleSchool): MiracleId[] {
  return (Object.entries(MIRACLE_SCHOOL) as [MiracleId, MiracleSchool][])
    .filter(([, id]) => id === school)
    .map(([miracle]) => miracle);
}

/**
 * The one miracle each enemy god reaches for — what makes a 火 god feel
 * unlike a 水 god across a whole match (see systems/enemyMiracles.ts).
 *
 * One per school rather than the whole school, on purpose. The enemy
 * casts on a timer, from a fixed priority list, at whatever settlement it
 * can reach; a god that picked freely from five would read as random
 * rather than as a character. One repeated signature is what a player can
 * actually learn to expect and plan against — docs/game-system.md's
 * 「行動パターン自体は比較的予測可能」.
 *
 * Each is picked for what it does to the *opponent's settlement*, since
 * that is what the enemy aims at:
 *
 * - 人 病原菌: takes a settlement's mana without killing anyone
 * - 植物 沼: a hole in the ground where their walkers are walking
 * - 地 地震: the long directional crack this game already had
 * - 気 雷: scattered strikes that kill people, burn houses, sour ground
 * - 火 火の雨: fire on a settlement, and it spreads through woodland
 * - 水 聖水の泉: takes their people rather than killing them — the enemy
 *   god's own spring, so whoever falls in comes out fighting for it
 */
/**
 * Which school each hero belongs to — the same six the miracles are filed
 * under, one hero each, which is the original's own pattern (see the note
 * above MIRACLE_SCHOOL).
 *
 * game2's own 守護者 is filed with ペルセウス in 人, beside the baseline
 * hero it is defined against, exactly as 守護者化 is among the miracles.
 */
export const HERO_SCHOOL: Record<HeroKind, MiracleSchool> = {
  perseus: "human",
  adonis: "plant",
  hercules: "earth",
  odysseus: "air",
  achilles: "fire",
  helen: "water",
  guardian: "human",
};

/**
 * Whether a walker shrugs off an attack miracle of `school` — 「ただし、
 * **同じカテゴリーの攻撃神技は効果がない**」.
 *
 * One rule, not six exceptions. The walkthrough source lists these
 * one-by-one as it describes each miracle — 沼「※アドニス除く」, 地割れ
 * 「※ヘラクレス除く」, 雷と竜巻「※オディッセウス除く」, 火柱と火の雨
 * 「※アキレス除く」, 聖水の泉「※トロイのヘレン除く」 — and every single
 * one of them is the hero of that miracle's own school. game2 had two of
 * them hard-coded as named special cases (crevice.ts checked for
 * "hercules", fire.ts for "achilles") and the rest missing; this is the
 * rule those two were instances of.
 *
 * Ordinary walkers resist nothing. Note the rule is about *attack* miracles
 * killing a hero, not about drowning: nothing in the source says a water
 * hero cannot drown, so systems that put a walker under the sea (flood,
 * tsunami, whirlpool erosion) do not consult this.
 */
export function resistsSchool(state: WalkerState, school: MiracleSchool): boolean {
  return isHeroState(state) && HERO_SCHOOL[state] === school;
}

export const ENEMY_SIGNATURE_MIRACLE: Record<MiracleSchool, MiracleId> = {
  human: "plague",
  plant: "swamp",
  earth: "earthquake",
  air: "lightning",
  fire: "fireRain",
  water: "holyWater",
};
