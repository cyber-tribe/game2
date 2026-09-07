import type { TerrainEditRule, TerrainType } from "../world/heightmap";
import type { MiracleSchool } from "./miracleSchools";

/**
 * The discretionary miracles a world can lock/unlock — everything a player
 * casts through the toolbar's [data-tool] buttons except 隆起/沈降 (always
 * available, gated only by terrainEditRule — it's the core "flatten your
 * land" loop every world needs to be playable at all) and 照会 (a free
 * inspection tool, not a miracle). Kept as its own type here rather than
 * reusing ui/toolbar.ts's ToolMode so game/ doesn't depend on ui/ — main.ts
 * bridges the two.
 */
export type MiracleId =
  | "shrine"
  | "earthquake"
  | "swamp"
  | "holyWater"
  | "tornado"
  | "firePillar"
  | "lightning"
  | "storm"
  | "plague"
  | "hurricane"
  | "reef"
  | "road"
  | "wall"
  | "megalith"
  | "fungus"
  | "perseus"
  | "hercules"
  | "odysseus"
  | "achilles"
  | "adonis"
  | "helen"
  | "guardian"
  | "forest"
  | "flower"
  | "fireRain"
  | "volcano"
  | "tsunami"
  | "armageddon";

/** Every discretionary miracle — see MiracleId. */
export const ALL_MIRACLES: readonly MiracleId[] = [
  "shrine",
  "earthquake",
  "swamp",
  "holyWater",
  "tornado",
  "firePillar",
  "lightning",
  "storm",
  "plague",
  "hurricane",
  "reef",
  "road",
  "wall",
  "megalith",
  "fungus",
  "perseus",
  "hercules",
  "odysseus",
  "achilles",
  "adonis",
  "helen",
  "guardian",
  "forest",
  "flower",
  "fireRain",
  "volcano",
  "tsunami",
  "armageddon",
];

/**
 * A qualitatively different way the enemy god plays, on top of (not instead
 * of) the purely numeric difficulty knobs below — see
 * plan/0072-enemy-personality.md. "aggressive"/"defensive" bias
 * systems/enemyMiracles.ts's escalation thresholds and hero-kind choice
 * (see ENEMY_PERSONALITY_TUNING in constants.ts); "balanced" reproduces
 * today's original thresholds exactly, so it's a safe default for tests
 * and for worlds too early to have a hero/volcano/armageddon to season
 * with a personality in the first place.
 */
export type EnemyPersonality = "balanced" | "aggressive" | "defensive";

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
 * recognizable rules, just press harder. enemyPersonality (see its own doc
 * comment) is the one axis that's exempt from that "same rules, just
 * harder" framing on purpose — it's meant to feel like a different
 * opponent, not a faster one.
 *
 * Map size is a fixed 64x64 for every world (see WORLDS below), not a
 * difficulty axis of its own — per plan/0062-original-scale-map.md's move
 * to one original-scale world every match pans across (like the original),
 * rather than a whole map shrunk to fit one screen and so, per-world,
 * differently sized.
 *
 * The campaign is the original's own 全48面 — 16 gods of 3 stages each,
 * generated from GODS below. (plan/0059-world-select.md once deferred
 * "500 worlds" as out of scope; that figure came from the generic
 * god-game research and belongs to the first POPULOUS, not to the SFC
 * POPULOUS 2 this project reproduces.) A password/continue system (see
 * nextWorldId/unlockedCountForPassword below) was added on top in
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
   * guardian/armageddon, so swamp/tsunami/shrine restrictions only affect
   * the player). Earlier worlds unlock fewer, later ones unlock more, same
   * monotonic "never relaxing" curve as terrain/terrainEditRule/enemy AI
   * speed — see WORLDS' own doc comment.
   */
  allowedMiracles: readonly MiracleId[];
  /**
   * The enemy god's play style for this world — see EnemyPersonality's own
   * doc comment. Deliberately not part of the monotonic "never relaxing"
   * curve the other axes follow (WORLDS' own doc comment): a later world
   * isn't necessarily a *more* aggressive/defensive version of an earlier
   * one, just a different character to play against.
   */
  enemyPersonality: EnemyPersonality;
  /**
   * Which of the original's six schools this world's enemy god draws its
   * miracles from — see miracleSchools.ts's ENEMY_SIGNATURE_MIRACLE.
   *
   * The axis that makes one god feel unlike another across a whole match:
   * a 火 god rains fire on your settlements, a 水 god takes your people
   * with a spring instead of killing them. Like enemyPersonality (and
   * unlike terrain or AI speed) it is deliberately not part of the
   * monotonic "never relaxing" curve — a later world's god isn't a
   * *harder* school, it is a different one.
   *
   * A god can only cast what its world unlocks (allowedMiracles gates it
   * exactly as it gates the player), so each world's own school is one
   * whose signature is unlocked there. A god whose signature is out of
   * reach falls back on 地震 like any other.
   */
  enemySchool: MiracleSchool;
  /**
   * Whether the player's raise/lower/flatten taps may directly reshape land
   * within the enemy's own territory — per docs/game-system.md 10節's
   * "各ワールドは...使用可能な奇跡の制限などが異なり", another stage-shaped
   * rule variation, same idea as terrainEditRule. "Territory" is the same
   * farmland radius EntityLayer already tints around each house (see
   * FARMLAND_RADIUS's own doc comment on why that's a house's visual
   * sphere of influence) — see Simulation.isEnemyTerritory, which main.ts's
   * applyTerrainEditAt is gated through when this is false. true (the
   * ordinary case) leaves today's behavior — anywhere on the map — as-is;
   * enemyTerraform.ts never needed the reverse restriction in the first
   * place, since the enemy AI already only ever levels land around its own
   * houses (see that file's own doc comment), never the player's.
   */
  enemyTerritoryEditable: boolean;
  /**
   * Whether a walker caught in a genuine body of water (see world/
   * heightmap.ts's isInWaterPool) drowns instantly instead of getting the
   * ordinary gradual, escapable countdown (see systems/drowning.ts) — a
   * "海がマグマ" ("the sea is molten") theming per feedback: "溺れると
   * すぐに死ぬなどの制約のある面もある(海がマグマなど)". This codebase's
   * "rock" terrain already stands in for lava fields (see TERRAIN_LABELS'
   * own "溶岩地帯" and TERRAIN_GROWTH_MULTIPLIER's doc comment), so every
   * rock-terrain world sets this true rather than introducing a separate
   * hazard concept.
   */
  instantDrowning: boolean;
  /**
   * Whether this world's 沼 are 底なし — permanent, never filling up —
   * rather than the kind that swallows a few walkers and dries up.
   * 「面ごとに底なしかどうか設定される」 (docs/original-miracles.md #8):
   * which kind a stage gets is the stage's own property in the original,
   * so it lives here rather than being one global rule.
   *
   * Not a monotonic difficulty axis. A bottomless swamp is stronger for
   * *whoever casts it*, and both gods cast it — the enemy's own 沼 become
   * permanent on the same worlds. It changes what the miracle is on that
   * stage (denying ground rather than killing a few), not how hard the
   * stage is.
   */
  bottomlessSwamp: boolean;
}

/**
 * The sixteen gods of the campaign — 「敵として16人の神が登場し、各3ステージが
 * 用意されている」. Their 3 stages each are what make up the original's
 * 全48面, and WORLDS below is generated from this table.
 *
 * A god, not a stage, is the unit the player experiences as an opponent:
 * the same character across three matches, with one school it draws its
 * miracles from (see miracleSchools.ts's ENEMY_SIGNATURE_MIRACLE) and one
 * temperament. So everything that says *who you are fighting* lives here —
 * school, personality, the terrain of its realm — while everything that
 * says *how hard* lives in the per-stage ramp in buildWorlds.
 *
 * Ordering rules, all checked by worlds.test.ts:
 *
 * - A god's school signature must already be unlocked by the time that god
 *   appears, or it would fall back on 地震 and the world select would be
 *   describing a school the player never actually sees. The first six gods
 *   are therefore one per school, each unlocking its own signature.
 * - `unlocks` across the whole table covers every MiracleId exactly once,
 *   so the last stage has all of them.
 * - Terrain gets harsher and terraforming gets restricted as the list goes
 *   on, but never monotonically per-god: a god's realm is a place, and the
 *   difficulty curve proper is the AI ramp, not the scenery.
 */
interface GodDefinition {
  id: string;
  name: string;
  school: MiracleSchool;
  personality: EnemyPersonality;
  terrain: TerrainType;
  terrainEditRule: TerrainEditRule;
  /** Miracles this god's first stage adds to the cumulative pool. */
  unlocks: readonly MiracleId[];
  /**
   * Whether the player may still reshape land inside this god's territory.
   * Once false it stays false for every god after — see WorldDefinition's
   * enemyTerritoryEditable.
   */
  territoryEditable: boolean;
  /** Whether this god's stages use 底なし沼 — see WorldDefinition.bottomlessSwamp. */
  bottomlessSwamp: boolean;
}

export const GODS: readonly GodDefinition[] = [
  // The first six are one per school, in the order docs/original-miracles.md
  // lists them, each introducing its own signature miracle.
  { id: "gaia", name: "大地神ガイア", school: "earth", personality: "balanced", terrain: "grass", terrainEditRule: "both", unlocks: ["earthquake"], bottomlessSwamp: false, territoryEditable: true },
  { id: "demeter", name: "豊穣神デメテル", school: "plant", personality: "balanced", terrain: "grass", terrainEditRule: "both", unlocks: ["swamp", "forest"], bottomlessSwamp: false, territoryEditable: true },
  { id: "aiolos", name: "風神アイオロス", school: "air", personality: "balanced", terrain: "snow", terrainEditRule: "both", unlocks: ["lightning", "shrine"], bottomlessSwamp: false, territoryEditable: true },
  { id: "hera", name: "女王神ヘラ", school: "human", personality: "balanced", terrain: "desert", terrainEditRule: "both", unlocks: ["plague", "perseus"], bottomlessSwamp: false, territoryEditable: true },
  { id: "hephaistos", name: "鍛冶神ヘパイストス", school: "fire", personality: "aggressive", terrain: "rock", terrainEditRule: "both", unlocks: ["fireRain", "firePillar"], bottomlessSwamp: false, territoryEditable: true },
  { id: "poseidon", name: "海神ポセイドン", school: "water", personality: "defensive", terrain: "grass", terrainEditRule: "raiseOnly", unlocks: ["holyWater", "reef"], bottomlessSwamp: false, territoryEditable: true },
  // The second six revisit the schools with a different temperament each,
  // and hand the player the terrain-shaping miracles.
  { id: "atlas", name: "巨神アトラス", school: "earth", personality: "aggressive", terrain: "desert", terrainEditRule: "both", unlocks: ["road", "wall"], bottomlessSwamp: false, territoryEditable: true },
  { id: "persephone", name: "冥后ペルセポネ", school: "plant", personality: "defensive", terrain: "snow", terrainEditRule: "lowerOnly", unlocks: ["fungus", "flower"], bottomlessSwamp: true, territoryEditable: true },
  { id: "boreas", name: "北風神ボレアス", school: "air", personality: "aggressive", terrain: "grass", terrainEditRule: "both", unlocks: ["tornado", "storm"], bottomlessSwamp: false, territoryEditable: true },
  { id: "athena", name: "戦神アテナ", school: "human", personality: "defensive", terrain: "desert", terrainEditRule: "raiseOnly", unlocks: ["guardian", "helen"], bottomlessSwamp: false, territoryEditable: true },
  { id: "prometheus", name: "先知神プロメテウス", school: "fire", personality: "aggressive", terrain: "rock", terrainEditRule: "lowerOnly", unlocks: ["volcano", "achilles"], bottomlessSwamp: false, territoryEditable: true },
  { id: "thetis", name: "海精テティス", school: "water", personality: "balanced", terrain: "snow", terrainEditRule: "both", unlocks: ["tsunami", "odysseus"], bottomlessSwamp: false, territoryEditable: true },
  // The last four close out the roster of heroes and the two miracles that
  // end matches outright, and their realms are off-limits to the player's
  // own spade.
  { id: "kronos", name: "時神クロノス", school: "earth", personality: "defensive", terrain: "rock", terrainEditRule: "raiseOnly", unlocks: ["megalith", "hercules"], bottomlessSwamp: false, territoryEditable: false },
  { id: "dionysos", name: "酒神ディオニュソス", school: "plant", personality: "aggressive", terrain: "desert", terrainEditRule: "lowerOnly", unlocks: ["adonis"], bottomlessSwamp: true, territoryEditable: false },
  { id: "zephyros", name: "西風神ゼピュロス", school: "air", personality: "defensive", terrain: "snow", terrainEditRule: "raiseOnly", unlocks: ["hurricane"], bottomlessSwamp: false, territoryEditable: false },
  { id: "hades", name: "冥王ハデス", school: "fire", personality: "aggressive", terrain: "rock", terrainEditRule: "lowerOnly", unlocks: ["armageddon"], bottomlessSwamp: true, territoryEditable: false },
];

/** How many stages each god gets — 「各3ステージが用意されている」. */
export const STAGES_PER_GOD = 3;

/** Stage numbering as it appears in a world's name. */
const STAGE_SUFFIXES = ["一", "二", "三"] as const;

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

/**
 * The AI ramp, as a function of position in the whole 48-stage campaign
 * rather than of which god it belongs to. Difficulty is one continuous
 * curve across the campaign; the gods are the characters drawn on top of
 * it, which is why school and personality live in GODS and these two
 * numbers do not.
 *
 * 6 down to 2 in even steps, floored so it never rises again — the
 * "never relaxing" rule worlds.test.ts enforces.
 */
function difficultyStep(stageIndex: number, total: number): number {
  return Math.max(2, 6 - Math.floor((stageIndex * 5) / total));
}

function buildWorlds(): WorldDefinition[] {
  const worlds: WorldDefinition[] = [];
  const total = GODS.length * STAGES_PER_GOD;
  const unlocked: MiracleId[] = [];

  GODS.forEach((god, godIndex) => {
    // Unlocked at the god's first stage and kept for the rest of the
    // campaign, so a god's three matches are played with one toolset and
    // the player has all three to learn what it just gained.
    unlocked.push(...god.unlocks);
    const allowedMiracles: readonly MiracleId[] = [...unlocked];

    for (let stage = 0; stage < STAGES_PER_GOD; stage++) {
      const stageIndex = godIndex * STAGES_PER_GOD + stage;
      worlds.push({
        id: `${god.id}-${stage + 1}`,
        name: `${god.name}・${STAGE_SUFFIXES[stage]}`,
        worldWidth: WORLD_SIZE,
        worldHeight: WORLD_SIZE,
        terrain: god.terrain,
        terrainEditRule: god.terrainEditRule,
        enemyDecisionInterval: difficultyStep(stageIndex, total),
        enemyAggressionThreshold: difficultyStep(stageIndex, total),
        allowedMiracles,
        enemyPersonality: god.personality,
        enemySchool: god.school,
        enemyTerritoryEditable: god.territoryEditable,
        // Tied to the terrain's own lava theming, not to difficulty — see
        // WorldDefinition.instantDrowning.
        instantDrowning: god.terrain === "rock",
        bottomlessSwamp: god.bottomlessSwamp,
      });
    }
  });

  return worlds;
}

export const WORLDS: WorldDefinition[] = buildWorlds();

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
