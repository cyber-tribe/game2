import type { TerrainEditRule, TerrainType } from "../world/heightmap";

/**
 * One fixed, selectable world for the 征服モード ("conquest mode") skeleton
 * — see docs/game-system.md 10節's "各ワールドは地形タイプ・初期配置・
 * 敵AIの攻撃性／賢さ・使用可能な奇跡の制限などが異なり、徐々に難しく
 * なる". This first step covers the axes that were already plumbed
 * per-match before this file existed (terrain type, terrainEditRule, map
 * size — see plan/0052-terrain-edit-rule.md and plan/0055-map-expansion.md)
 * by fixing them per world instead of rolling them randomly every match.
 * World-count progression (500 worlds) and per-world enemy AI tuning are
 * deliberately out of scope here — see plan/0059-world-select.md. A
 * password/continue system (see nextWorldId/unlockedCountForPassword
 * below) was added on top in plan/0060-campaign-password.md.
 */
export interface WorldDefinition {
  id: string;
  name: string;
  worldWidth: number;
  worldHeight: number;
  terrain: TerrainType;
  terrainEditRule: TerrainEditRule;
}

/**
 * Ordered roughly by difficulty: map size only grows (more houses, longer
 * matches to manage) and terrain only gets harsher (TERRAIN_GROWTH_
 * MULTIPLIER: grass 1 > snow 0.75 > desert 0.6 > rock 0.4) or more
 * terraforming-restricted (raiseOnly/lowerOnly makes flattening land
 * harder than "both") as the list goes on — never both relaxing at once.
 * Sizes stay at or under 32, the largest map size performance-measured
 * safe so far (see plan/0055-map-expansion.md); nothing here exceeds that
 * ceiling.
 */
export const WORLDS: WorldDefinition[] = [
  { id: "quiet-plain", name: "静かな草原", worldWidth: 20, worldHeight: 20, terrain: "grass", terrainEditRule: "both" },
  { id: "dry-highland", name: "乾いた高地", worldWidth: 24, worldHeight: 24, terrain: "desert", terrainEditRule: "both" },
  { id: "frozen-border", name: "凍てつく国境", worldWidth: 24, worldHeight: 24, terrain: "snow", terrainEditRule: "raiseOnly" },
  { id: "ashen-waste", name: "灰の荒野", worldWidth: 28, worldHeight: 28, terrain: "rock", terrainEditRule: "lowerOnly" },
  { id: "rising-frontier", name: "隆起する辺境", worldWidth: 28, worldHeight: 28, terrain: "desert", terrainEditRule: "raiseOnly" },
  { id: "final-frontline", name: "最終戦線", worldWidth: 32, worldHeight: 32, terrain: "rock", terrainEditRule: "lowerOnly" },
];

/**
 * The "password" (per docs/game-system.md 10節's "クリアするとパスワード
 * （ワールド名）が与えられ、そこから再開できる") shown to the player after
 * clearing `worldId` — literally the next world's own id/name, matching
 * the doc's own parenthetical rather than some derived/hashed code.
 * Undefined once `worldId` is the last entry in WORLDS (nothing left to
 * unlock). "勝ち方の内容に応じて数ワールド先へスキップできる" (skipping
 * further ahead based on how decisively the player won) is deliberately
 * not modeled here — every clear advances by exactly one world.
 */
export function nextWorldId(worldId: string): string | undefined {
  const index = WORLDS.findIndex((world) => world.id === worldId);
  if (index === -1 || index === WORLDS.length - 1) return undefined;
  return WORLDS[index + 1].id;
}

/**
 * How many worlds, counting from the start of WORLDS, a given password
 * unlocks — one past whichever world's id it matches, so entering the
 * password nextWorldId returned after clearing world i (i.e. WORLDS[i+1]'s
 * own id) unlocks indices 0..i+1: both the world just cleared and the new
 * one. Undefined for a password that doesn't match any world's id.
 */
export function unlockedCountForPassword(password: string): number | undefined {
  const index = WORLDS.findIndex((world) => world.id === password);
  return index === -1 ? undefined : index + 1;
}
