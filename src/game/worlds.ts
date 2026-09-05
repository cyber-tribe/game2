import type { TerrainEditRule, TerrainType } from "../world/heightmap";

/**
 * The discretionary miracles a world can lock/unlock — everything a player
 * casts through the toolbar's [data-tool] buttons except 隆起/沈降 (always
 * available, gated only by terrainEditRule — it's the core "flatten your
 * land" loop every world needs to be playable at all) and 照会 (a free
 * inspection tool, not a miracle). Kept as its own type here rather than
 * reusing ui/toolbar.ts's ToolMode so game/ doesn't depend on ui/ — main.ts
 * bridges the two.
 */
export type MiracleId = "shrine" | "earthquake" | "swamp" | "knight" | "volcano" | "flood" | "armageddon";

/** Every discretionary miracle — see MiracleId. */
export const ALL_MIRACLES: readonly MiracleId[] = ["shrine", "earthquake", "swamp", "knight", "volcano", "flood", "armageddon"];

/**
 * One fixed, selectable world for the 征服モード ("conquest mode") skeleton
 * — see docs/game-system.md 10節's "各ワールドは地形タイプ・初期配置・
 * 敵AIの攻撃性／賢さ・使用可能な奇跡の制限などが異なり、徐々に難しく
 * なる". This first step covers the axes that were already plumbed
 * per-match before this file existed (terrain type, terrainEditRule — see
 * plan/0052-terrain-edit-rule.md), plus the enemy AI's "攻撃性"
 * （enemyAggressionThreshold）と"介入速度"（enemyDecisionInterval）— see
 * plan/0061-per-world-ai-difficulty.md. "賢さ" (the AI's actual decision
 * *logic*, not just how eagerly/often it acts) is deliberately not touched
 * here — per the same doc's own "高難度では敵の介入頻度が上がるが、行動
 * パターン自体は比較的予測可能", a harder world should still play by
 * recognizable rules, just press harder.
 *
 * Map size is a fixed 64x64 for every world (see WORLDS below), not a
 * difficulty axis of its own — per plan/0062-original-scale-map.md's move
 * to one original-scale world every match pans across (like the original),
 * rather than a whole map shrunk to fit one screen and so, per-world,
 * differently sized.
 *
 * World-count progression (500 worlds) is still out of scope — see
 * plan/0059-world-select.md. A password/continue system (see nextWorldId/
 * unlockedCountForPassword below) was added on top in
 * plan/0060-campaign-password.md.
 */
export interface WorldDefinition {
  id: string;
  name: string;
  worldWidth: number;
  worldHeight: number;
  terrain: TerrainType;
  terrainEditRule: TerrainEditRule;
  /**
   * Seconds between the enemy AI re-evaluating its behaviorMode/miracle
   * choices — see systems/enemyAi.ts's EnemyAiConfig.decisionInterval and
   * systems/enemyMiracles.ts's EnemyMiracleConfig.decisionInterval (both
   * fed this same value). Lower = the enemy notices and reacts to changes
   * faster, i.e. docs/game-system.md's "介入速度".
   */
  enemyDecisionInterval: number;
  /**
   * Walker count at/above which the enemy AI goes to "fight" mode — see
   * systems/enemyAi.ts's EnemyAiConfig.aggressionThreshold. Lower = the
   * enemy turns aggressive with a smaller army, i.e. docs/game-system.md's
   * "攻撃性".
   */
  enemyAggressionThreshold: number;
  /**
   * Which discretionary miracles this world lets either side cast at all —
   * per docs/game-system.md 10節's "使用可能な奇跡の制限" — checked
   * equally for the player's own taps (main.ts) and the enemy's own
   * casting (enemyMiracles.ts only ever casts earthquake/volcano/knight/
   * armageddon, so swamp/flood/shrine restrictions only affect the
   * player). Earlier worlds unlock fewer, later ones unlock more, same
   * monotonic "never relaxing" curve as terrain/terrainEditRule/enemy AI
   * speed — see WORLDS' own doc comment.
   */
  allowedMiracles: readonly MiracleId[];
}

/**
 * Every world is a fixed 64x64 (see WorldDefinition's doc comment) — only
 * terrain, terrainEditRule, enemy AI speed/aggression, and allowedMiracles
 * vary and grow harder as the list goes on: terrain gets harsher (TERRAIN_
 * GROWTH_MULTIPLIER: grass 1 > snow 0.75 > desert 0.6 > rock 0.4),
 * terraforming gets restricted to one direction (raiseOnly/lowerOnly,
 * harder than "both"), the enemy AI gets faster/more aggressive, and more
 * miracles unlock — never any axis relaxing at once. allowedMiracles is
 * cumulative (each world keeps everything the previous one had) so a
 * returning player is never surprised by something that used to work no
 * longer working; by the final world every miracle is unlocked.
 */
const WORLD_SIZE = 64;

export const WORLDS: WorldDefinition[] = [
  { id: "quiet-plain", name: "静かな草原", worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE, terrain: "grass", terrainEditRule: "both", enemyDecisionInterval: 6, enemyAggressionThreshold: 6, allowedMiracles: ["earthquake"] },
  { id: "dry-highland", name: "乾いた高地", worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE, terrain: "desert", terrainEditRule: "both", enemyDecisionInterval: 5, enemyAggressionThreshold: 5, allowedMiracles: ["earthquake", "swamp"] },
  { id: "frozen-border", name: "凍てつく国境", worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE, terrain: "snow", terrainEditRule: "raiseOnly", enemyDecisionInterval: 5, enemyAggressionThreshold: 4, allowedMiracles: ["earthquake", "swamp", "shrine"] },
  { id: "ashen-waste", name: "灰の荒野", worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE, terrain: "rock", terrainEditRule: "lowerOnly", enemyDecisionInterval: 4, enemyAggressionThreshold: 3, allowedMiracles: ["earthquake", "swamp", "shrine", "knight"] },
  { id: "rising-frontier", name: "隆起する辺境", worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE, terrain: "desert", terrainEditRule: "raiseOnly", enemyDecisionInterval: 3, enemyAggressionThreshold: 3, allowedMiracles: ["earthquake", "swamp", "shrine", "knight", "volcano"] },
  { id: "final-frontline", name: "最終戦線", worldWidth: WORLD_SIZE, worldHeight: WORLD_SIZE, terrain: "rock", terrainEditRule: "lowerOnly", enemyDecisionInterval: 2, enemyAggressionThreshold: 2, allowedMiracles: ALL_MIRACLES },
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
