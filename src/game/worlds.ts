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
  | "whirlpool"
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
  "whirlpool",
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
  /** The god waiting here — 「アルゴス(プロメテウス)」. See STAGES. */
  god: string;
  /** 地上編 (No.1-30) or 天上編 (No.31-48) — the original's own two acts. */
  chapter: "地上編" | "天上編";
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
   * Whether the player may raise and lower land **anywhere**, open sea
   * included — the original's 「どこでも↑↓」 and 「海上に土地↑↓」, which its
   * own table always sets together (see docs/original-maps.md).
   *
   * True on only five of the forty-eight: No.1-4 and No.19. Everywhere else
   * the spade reaches only ground that already touches land, so **a stage
   * is the island you were given** rather than a canvas — you widen a
   * coast, you do not conjure a new continent across the map. game2 let a
   * player raise a mountain out of open water anywhere, which quietly made
   * the geography of every stage irrelevant.
   */
  openTerraforming: boolean;
  /**
   * Whether スプログ works here — the original's own per-stage ○×.
   *
   * Off on exactly three stages: No.46-48, ゼウス's. The last god takes
   * away the operation the original singles out as its own improvement
   * over the first game (「前作に無かった仕様で、ゲームの進行が早くなったと
   * 好評」), which is a fine last word for a final opponent.
   */
  sprogAllowed: boolean;
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
/**
 * One stage of the campaign, exactly as the original lays it out — see
 * `docs/original-maps.md`, which holds the whole 48-row table this is
 * transcribed from (place, god, chapter, the ten ○× settings, and the
 * 6x5 grid of miracles each stage allows).
 *
 * **The hand is dealt per stage, not accumulated.** game2 used to invent
 * sixteen gods and hand out miracles cumulatively — a god's first stage
 * unlocked something and its three matches were played with one toolset
 * that never shrank. The original does nothing of the sort: No.4 takes
 * ペルセウス, 沼, 火柱 and 雷 away all at once, No.29 drops fourteen of the
 * previous stage's, and a god's three stages routinely differ from each
 * other. Reading the table straight is the only way to get that.
 *
 * Three of the ten per-stage settings map onto fields game2 already had:
 * 土地の↑/↓ become terrainEditRule, 敵陣での↑↓ becomes
 * enemyTerritoryEditable, and 底なし沼 becomes bottomlessSwamp. The other
 * seven (どこでも↑↓ / 海上に土地↑↓ / 溺れた人間の救出 / 敵の位置表示 /
 * スプログ / 災害箇所表示) have no field yet — see docs/original-miracles.md.
 *
 * `terrain` and `enemyPersonality` are **game2's own**: the original's map
 * data records neither, so they are assigned here to give the sixteen
 * realms some variety, ground-level places (地上編) reading greener than
 * the gods' halls (天上編).
 *
 * `enemySchool` is the god's own mythological domain, and is flavour rather
 * than an invariant: it is what the world select calls the god, while what
 * the god can actually *cast* is whatever that stage allows. Six of the
 * forty-eight stages allow nothing from their own god's school at all, so
 * tying the two together would mean rewriting the original's table. See
 * enemyMiracles.ts, which already falls back when its signature is not on
 * the stage's list — and falls back to nothing at all on the earliest
 * stages, which is exactly what the source says of them:
 * 「土地上下とマグネットのみ。しかも反応が極めて遅い」.
 */
interface StageDefinition {
  id: string;
  /** The Greek place, or the hall of the god — 「アルゴス」「冥王の宮」. */
  place: string;
  god: string;
  chapter: "地上編" | "天上編";
  /** 1, 2 or 3 — every god gets three, per 「各3ステージが用意されている」. */
  stage: number;
  terrain: TerrainType;
  terrainEditRule: TerrainEditRule;
  enemyPersonality: EnemyPersonality;
  enemySchool: MiracleSchool;
  enemyTerritoryEditable: boolean;
  bottomlessSwamp: boolean;
  openTerraforming: boolean;
  sprogAllowed: boolean;
  allowedMiracles: readonly MiracleId[];
}

/**
 * The original's own 48, in order. Transcribed from the table in
 * `docs/original-maps.md` rather than typed by hand.
 *
 * 守護者化 rides with ペルセウス wherever it appears: it is game2's own
 * hero (the original has no defensive one), so it has no row of its own in
 * the source, and the baseline hero it is defined against is the natural
 * place to hang it.
 */
const STAGES: readonly StageDefinition[] = [
  { id: "argos-1", place: "アルゴス", god: "プロメテウス", chapter: "地上編", stage: 1, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "fire", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: true, sprogAllowed: true, allowedMiracles: ["shrine", "firePillar", "perseus", "guardian", "armageddon"] },
  { id: "argos-2", place: "アルゴス", god: "プロメテウス", chapter: "地上編", stage: 2, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "fire", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: true, sprogAllowed: true, allowedMiracles: ["shrine", "swamp", "firePillar", "lightning", "perseus", "guardian", "armageddon"] },
  { id: "argos-3", place: "アルゴス", god: "プロメテウス", chapter: "地上編", stage: 3, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "fire", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: true, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "firePillar", "lightning", "perseus", "guardian", "fireRain", "armageddon"] },
  { id: "sparta-1", place: "スパルタ", god: "ヘルメス", chapter: "地上編", stage: 1, terrain: "grass", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "air", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: true, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "holyWater", "tornado", "odysseus", "fireRain", "armageddon"] },
  { id: "sparta-2", place: "スパルタ", god: "ヘルメス", chapter: "地上編", stage: 2, terrain: "grass", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "air", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "swamp", "holyWater", "tornado", "odysseus", "fireRain", "armageddon"] },
  { id: "sparta-3", place: "スパルタ", god: "ヘルメス", chapter: "地上編", stage: 3, terrain: "grass", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "air", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "lightning", "storm", "odysseus", "armageddon"] },
  { id: "crete-1", place: "クレタ", god: "ステュクス", chapter: "地上編", stage: 1, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "water", enemyTerritoryEditable: true, bottomlessSwamp: false, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "swamp", "firePillar", "adonis", "forest", "fireRain", "whirlpool", "armageddon"] },
  { id: "crete-2", place: "クレタ", god: "ステュクス", chapter: "地上編", stage: 2, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "water", enemyTerritoryEditable: true, bottomlessSwamp: false, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "firePillar", "road", "wall", "adonis", "forest", "armageddon"] },
  { id: "crete-3", place: "クレタ", god: "ステュクス", chapter: "地上編", stage: 3, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "water", enemyTerritoryEditable: true, bottomlessSwamp: false, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "firePillar", "road", "wall", "fungus", "adonis", "forest", "flower", "armageddon"] },
  { id: "cyprus-1", place: "キプロス", god: "アフロディーテ", chapter: "地上編", stage: 1, terrain: "desert", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "human", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "firePillar", "road", "wall", "megalith", "fungus", "hercules", "forest", "flower", "armageddon"] },
  { id: "cyprus-2", place: "キプロス", god: "アフロディーテ", chapter: "地上編", stage: 2, terrain: "desert", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "human", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "firePillar", "reef", "road", "wall", "megalith", "fungus", "hercules", "forest", "flower", "whirlpool", "armageddon"] },
  { id: "cyprus-3", place: "キプロス", god: "アフロディーテ", chapter: "地上編", stage: 3, terrain: "desert", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "human", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "holyWater", "firePillar", "lightning", "hercules", "whirlpool", "armageddon"] },
  { id: "delos-1", place: "デロス", god: "アレス", chapter: "地上編", stage: 1, terrain: "grass", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "human", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "reef", "helen", "tsunami"] },
  { id: "delos-2", place: "デロス", god: "アレス", chapter: "地上編", stage: 2, terrain: "grass", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "human", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "tornado", "firePillar", "reef", "road", "wall", "megalith", "fungus", "helen", "forest", "flower", "fireRain", "tsunami", "whirlpool"] },
  { id: "delos-3", place: "デロス", god: "アレス", chapter: "地上編", stage: 3, terrain: "grass", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "human", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "holyWater", "lightning", "storm", "plague", "hurricane", "road", "wall", "megalith", "fungus", "helen", "forest", "flower", "fireRain", "whirlpool"] },
  { id: "athens-1", place: "アテナイ", god: "アテナ", chapter: "地上編", stage: 1, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "human", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "holyWater", "tornado", "firePillar", "plague", "reef", "road", "wall", "megalith", "fungus", "achilles", "flower", "volcano", "whirlpool", "armageddon"] },
  { id: "athens-2", place: "アテナイ", god: "アテナ", chapter: "地上編", stage: 2, terrain: "grass", terrainEditRule: "raiseOnly", enemyPersonality: "balanced", enemySchool: "human", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "swamp", "tornado", "firePillar", "megalith", "fungus", "forest", "flower", "whirlpool"] },
  { id: "athens-3", place: "アテナイ", god: "アテナ", chapter: "地上編", stage: 3, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "human", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "swamp", "holyWater", "lightning", "storm", "wall", "achilles", "forest", "flower", "volcano", "tsunami", "armageddon"] },
  { id: "mycenae-1", place: "ミュケナイ", god: "ディオニュソス", chapter: "地上編", stage: 1, terrain: "desert", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "plant", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: true, sprogAllowed: true, allowedMiracles: ["shrine", "holyWater", "road", "wall", "adonis", "flower", "armageddon"] },
  { id: "mycenae-2", place: "ミュケナイ", god: "ディオニュソス", chapter: "地上編", stage: 2, terrain: "desert", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "plant", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "tornado", "firePillar", "reef", "adonis", "fireRain", "volcano", "tsunami", "whirlpool", "armageddon"] },
  { id: "mycenae-3", place: "ミュケナイ", god: "ディオニュソス", chapter: "地上編", stage: 3, terrain: "desert", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "plant", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "plague", "hurricane", "megalith", "adonis", "flower", "volcano", "tsunami", "armageddon"] },
  { id: "larissa-1", place: "ラリッサ", god: "ヘパイストス", chapter: "地上編", stage: 1, terrain: "rock", terrainEditRule: "raiseOnly", enemyPersonality: "aggressive", enemySchool: "fire", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "holyWater", "firePillar", "reef", "achilles", "forest", "flower", "fireRain", "whirlpool"] },
  { id: "larissa-2", place: "ラリッサ", god: "ヘパイストス", chapter: "地上編", stage: 2, terrain: "rock", terrainEditRule: "neither", enemyPersonality: "aggressive", enemySchool: "fire", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "tornado", "firePillar", "megalith", "fungus", "forest", "flower", "whirlpool"] },
  { id: "larissa-3", place: "ラリッサ", god: "ヘパイストス", chapter: "地上編", stage: 3, terrain: "rock", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "fire", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "hurricane", "reef", "megalith", "fungus", "armageddon"] },
  { id: "thrace-1", place: "トラキア", god: "デメテル", chapter: "地上編", stage: 1, terrain: "snow", terrainEditRule: "lowerOnly", enemyPersonality: "balanced", enemySchool: "plant", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["earthquake", "swamp", "holyWater", "lightning", "storm", "plague", "megalith", "adonis", "forest", "flower", "volcano", "whirlpool", "armageddon"] },
  { id: "thrace-2", place: "トラキア", god: "デメテル", chapter: "地上編", stage: 2, terrain: "snow", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "plant", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "firePillar", "road", "wall", "adonis", "forest", "flower"] },
  { id: "thrace-3", place: "トラキア", god: "デメテル", chapter: "地上編", stage: 3, terrain: "snow", terrainEditRule: "raiseOnly", enemyPersonality: "balanced", enemySchool: "plant", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "reef", "adonis", "tsunami"] },
  { id: "olympus-1", place: "オリュンポス山", god: "ガイア", chapter: "地上編", stage: 1, terrain: "rock", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "earth", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "tornado", "firePillar", "plague", "hurricane", "reef", "road", "wall", "hercules", "forest", "flower", "fireRain", "volcano", "tsunami", "whirlpool", "armageddon"] },
  { id: "olympus-2", place: "オリュンポス山", god: "ガイア", chapter: "地上編", stage: 2, terrain: "rock", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "earth", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "hurricane", "hercules", "tsunami", "armageddon"] },
  { id: "olympus-3", place: "オリュンポス山", god: "ガイア", chapter: "地上編", stage: 3, terrain: "rock", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "earth", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "lightning", "wall", "hercules", "flower", "armageddon"] },
  { id: "artemis-1", place: "月神の宮", god: "アルテミス", chapter: "天上編", stage: 1, terrain: "snow", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "plant", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "plague", "perseus", "guardian", "armageddon"] },
  { id: "artemis-2", place: "月神の宮", god: "アルテミス", chapter: "天上編", stage: 2, terrain: "snow", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "plant", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "swamp"] },
  { id: "artemis-3", place: "月神の宮", god: "アルテミス", chapter: "天上編", stage: 3, terrain: "snow", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "plant", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "tornado", "firePillar", "reef", "perseus", "guardian", "flower", "fireRain", "volcano", "tsunami", "whirlpool", "armageddon"] },
  { id: "apollo-1", place: "太陽神の宮", god: "アポロン", chapter: "天上編", stage: 1, terrain: "desert", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "fire", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "holyWater", "plague", "flower", "armageddon"] },
  { id: "apollo-2", place: "太陽神の宮", god: "アポロン", chapter: "天上編", stage: 2, terrain: "desert", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "fire", enemyTerritoryEditable: false, bottomlessSwamp: false, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "holyWater", "firePillar", "lightning", "storm", "plague", "hurricane", "reef", "road", "wall", "fungus", "achilles", "forest", "flower", "fireRain", "volcano", "tsunami", "whirlpool", "armageddon"] },
  { id: "apollo-3", place: "太陽神の宮", god: "アポロン", chapter: "天上編", stage: 3, terrain: "desert", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "fire", enemyTerritoryEditable: true, bottomlessSwamp: false, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "tornado", "firePillar", "reef", "achilles", "fireRain", "volcano", "tsunami", "whirlpool", "armageddon"] },
  { id: "hera-1", place: "天界王妃の宮", god: "ヘラ", chapter: "天上編", stage: 1, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "human", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "holyWater", "lightning", "plague", "odysseus"] },
  { id: "hera-2", place: "天界王妃の宮", god: "ヘラ", chapter: "天上編", stage: 2, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "human", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "firePillar", "storm", "megalith", "fungus", "odysseus", "forest", "flower", "whirlpool", "armageddon"] },
  { id: "hera-3", place: "天界王妃の宮", god: "ヘラ", chapter: "天上編", stage: 3, terrain: "grass", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "human", enemyTerritoryEditable: true, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "swamp", "fungus", "odysseus", "forest", "flower"] },
  { id: "poseidon-1", place: "海王の宮", god: "ポセイドン", chapter: "天上編", stage: 1, terrain: "snow", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "water", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "holyWater", "firePillar", "lightning", "storm", "plague", "hurricane", "reef", "road", "wall", "megalith", "fungus", "helen", "forest", "flower", "fireRain", "volcano", "tsunami", "whirlpool"] },
  { id: "poseidon-2", place: "海王の宮", god: "ポセイドン", chapter: "天上編", stage: 2, terrain: "snow", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "water", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "holyWater", "tornado", "firePillar", "plague", "hurricane", "reef", "road", "wall", "megalith", "fungus", "helen", "forest", "flower", "fireRain", "volcano", "tsunami", "whirlpool"] },
  { id: "poseidon-3", place: "海王の宮", god: "ポセイドン", chapter: "天上編", stage: 3, terrain: "snow", terrainEditRule: "both", enemyPersonality: "defensive", enemySchool: "water", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "swamp", "firePillar", "lightning", "storm", "hurricane", "reef", "road", "wall", "megalith", "fungus", "helen", "forest", "flower", "fireRain", "volcano"] },
  { id: "hades-1", place: "冥王の宮", god: "ハデス", chapter: "天上編", stage: 1, terrain: "rock", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "earth", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "earthquake", "perseus", "guardian", "volcano"] },
  { id: "hades-2", place: "冥王の宮", god: "ハデス", chapter: "天上編", stage: 2, terrain: "rock", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "earth", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "swamp", "fungus", "achilles", "forest", "flower"] },
  { id: "hades-3", place: "冥王の宮", god: "ハデス", chapter: "天上編", stage: 3, terrain: "rock", terrainEditRule: "both", enemyPersonality: "aggressive", enemySchool: "earth", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: true, allowedMiracles: ["shrine", "firePillar", "lightning", "road", "hercules", "forest"] },
  { id: "zeus-1", place: "オリュンポス神殿", god: "ゼウス", chapter: "天上編", stage: 1, terrain: "rock", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "air", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: false, allowedMiracles: ["shrine", "earthquake", "swamp", "firePillar", "lightning", "storm", "reef", "adonis", "fireRain", "volcano", "tsunami", "whirlpool", "armageddon"] },
  { id: "zeus-2", place: "オリュンポス神殿", god: "ゼウス", chapter: "天上編", stage: 2, terrain: "rock", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "air", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: false, allowedMiracles: ["shrine", "lightning", "storm", "hurricane", "odysseus"] },
  { id: "zeus-3", place: "オリュンポス神殿", god: "ゼウス", chapter: "天上編", stage: 3, terrain: "rock", terrainEditRule: "both", enemyPersonality: "balanced", enemySchool: "air", enemyTerritoryEditable: false, bottomlessSwamp: true, openTerraforming: false, sprogAllowed: false, allowedMiracles: ["earthquake", "holyWater", "lightning", "storm", "hurricane", "reef", "wall", "fungus", "hercules", "forest", "flower", "fireRain", "volcano"] },
];

/**
 * The sixteen gods, derived from the stage table rather than declared
 * beside it — the campaign is the list of stages, and a "god" is just the
 * three consecutive stages that share one.
 */
export const GODS: readonly { id: string; place: string; god: string; chapter: string; school: MiracleSchool }[] =
  STAGES.filter((stage) => stage.stage === 1).map(({ place, god, chapter, enemySchool }) => ({
    id: place,
    place,
    god,
    chapter,
    school: enemySchool,
  }));

/** How many stages each god gets — 「各3ステージが用意されている」. */
export const STAGES_PER_GOD = 3;

/** Stage numbering as it appears in a world's name. */
const STAGE_SUFFIXES = ["一", "二", "三"] as const;

/** Every world is a fixed 64x64 — see WorldDefinition's doc comment and plan/0062. */
const WORLD_SIZE = 64;

/**
 * The AI ramp, as a function of position in the whole 48-stage campaign.
 *
 * This is game2's own, and it is now the *only* axis that rises
 * monotonically. The original's stages do not get steadily harder in what
 * they allow — the hand shrinks and grows all the way through — so the
 * curve that makes the campaign a campaign has to be the opponent rather
 * than the toolset. 6 down to 2 in even steps, floored so it never rises
 * again.
 */
function difficultyStep(stageIndex: number, total: number): number {
  return Math.max(2, 6 - Math.floor((stageIndex * 5) / total));
}

function buildWorlds(): WorldDefinition[] {
  return STAGES.map((stage, index) => ({
    id: stage.id,
    name: `${stage.place}・${STAGE_SUFFIXES[stage.stage - 1]}`,
    god: stage.god,
    chapter: stage.chapter,
    worldWidth: WORLD_SIZE,
    worldHeight: WORLD_SIZE,
    terrain: stage.terrain,
    terrainEditRule: stage.terrainEditRule,
    enemyDecisionInterval: difficultyStep(index, STAGES.length),
    enemyAggressionThreshold: difficultyStep(index, STAGES.length),
    allowedMiracles: stage.allowedMiracles,
    enemyPersonality: stage.enemyPersonality,
    enemySchool: stage.enemySchool,
    enemyTerritoryEditable: stage.enemyTerritoryEditable,
    bottomlessSwamp: stage.bottomlessSwamp,
    openTerraforming: stage.openTerraforming,
    sprogAllowed: stage.sprogAllowed,
    // Kept as it was: every 溶岩地帯 stage drowns instantly — see the field's
    // own doc comment. Terrain is game2's choice here, so this rides on it.
    instantDrowning: stage.terrain === "rock",
  }));
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
