import type { TerrainType } from "../world/heightmap";
import type { HouseLevel } from "./components";

/** Tiles per second for a freshly spawned walker. */
export const DEFAULT_WALKER_SPEED = 1.5;

/** Radius (in tiles) a "seeking" walker without a target wanders within. */
export const DEFAULT_WANDER_RADIUS = 6;

/** Population units a house accumulates per second. */
export const DEFAULT_POPULATION_GROWTH_RATE = 2;

/**
 * Multiplies DEFAULT_POPULATION_GROWTH_RATE by a heightmap's terrain type —
 * per docs/game-system.md, "地形タイプ...見た目だけでなく民の成長速度
 * などに影響する（例：草原は標準、砂漠は成長が遅い、溶岩地帯はさらに
 * 過酷）". "rock" stands in for the doc's 溶岩地帯 (lava fields) — the
 * harshest terrain, since this codebase doesn't model lava separately
 * from volcano rock.
 */
export const TERRAIN_GROWTH_MULTIPLIER: Record<TerrainType, number> = {
  grass: 1,
  desert: 0.6,
  snow: 0.75,
  rock: 0.4,
};

/** Japanese display name for each terrain type, per docs/game-system.md's own wording. */
export const TERRAIN_LABELS: Record<TerrainType, string> = {
  grass: "草原",
  desert: "砂漠",
  snow: "雪原",
  rock: "溶岩地帯",
};

/**
 * Capacity, mana output, and defense per house level. manaRate was
 * originally 1/3/6/12 — a couple of houses alone refilled EARTHQUAKE_
 * MANA_COST in a few seconds, making mana a non-factor rather than the
 * scarce resource docs/game-system.md describes ("マナは無制限なのか"
 * player feedback). Cut to a fifth so a modest early economy takes
 * real, felt time to afford a mid-tier miracle, while a developed one
 * still earns power meaningfully faster than a fledgling one — see
 * plan/archived/0018-mana-pacing-rebalance.md.
 */
export const HOUSE_LEVELS: Record<HouseLevel, { capacity: number; manaRate: number; defense: number }> = {
  hut: { capacity: 10, manaRate: 0.2, defense: 3 },
  lodge: { capacity: 20, manaRate: 0.5, defense: 6 },
  manor: { capacity: 35, manaRate: 1, defense: 12 },
  castle: { capacity: 60, manaRate: 2, defense: 20 },
};

/** hut < lodge < manor < castle, for comparing/advancing levels. */
export const HOUSE_LEVEL_ORDER: HouseLevel[] = ["hut", "lodge", "manor", "castle"];

/**
 * Ceiling on how much of a faction's total mana rate hut-level houses can
 * contribute, however many of them there are — see manaSystem. Population
 * growth spawns new hut-level houses automatically (see houseGrowth.ts),
 * capped only by maxHousesPerFaction (50 on a 20x20 map), so without this
 * a faction could fund EARTHQUAKE_MANA_COST-tier miracle spam purely by
 * letting houses pile up, never once flattening land to level any of them
 * up — the opposite of docs/game-system.md's growth loop. Lodge and above
 * have no such cap: reaching them already requires real investment
 * (flattening HOUSE_UPGRADE_FLATNESS_RADIUS's worth of land per house), so
 * more of them is a genuine achievement worth rewarding in full. Set to 5
 * huts' worth (5 * HOUSE_LEVELS.hut.manaRate) — enough for a small starting
 * village to feel normal, but not enough on its own to make earthquake
 * (cost 20) a repeatable button.
 */
export const HUT_MANA_RATE_CAP = 5 * HOUSE_LEVELS.hut.manaRate;

/** How far around a house (in tiles) countFlatNeighbors looks when checking for an upgrade. */
export const HOUSE_UPGRADE_FLATNESS_RADIUS = 2;

/**
 * Minimum countFlatNeighbors(heightmap, house.x, house.y, HOUSE_UPGRADE_FLATNESS_RADIUS)
 * needed to reach each level — per docs/game-system.md, "周囲の地形をさらに
 * 平らにすると自動でアップグレードされる". At radius 2 the window holds
 * at most 25 vertices, so these are placeholder tuning values within that
 * range; "hut" has no requirement since it's the starting level.
 */
export const HOUSE_LEVEL_FLATNESS_REQUIREMENT: Record<HouseLevel, number> = {
  hut: 0,
  lodge: 5,
  manor: 10,
  castle: 18,
};

/** A walker and an enemy walker/house within this many tiles fight it out. */
export const COMBAT_RANGE = 0.5;

/**
 * Placeholder land-scarcity proxy: roughly how many map tiles a faction
 * needs per house it's allowed to build, used to derive
 * HouseGrowthConfig.maxHousesPerFaction from world size until real
 * terrain-based flat-land scarcity is implemented.
 */
export const TILES_PER_HOUSE_CAP = 8;

/** Mana cost of raising or lowering one terrain vertex by one step. */
export const TERRAIN_EDIT_MANA_COST = 1;

/**
 * Mana cost of moving a faction's shrine (集結シンボル移動) — "小" tier,
 * pricier than a plain terrain edit but well below an earthquake, matching
 * its place on the mana bar in docs/game-system.md.
 */
export const SHRINE_MOVE_MANA_COST = 5;

/**
 * Mana cost of an earthquake. Costs far more than a plain terrain edit,
 * matching its place well to the right of "raise/lower land" on the mana
 * bar described in docs/game-system.md.
 */
export const EARTHQUAKE_MANA_COST = 20;

/** Two same-faction walkers within this many tiles merge under "gather". */
export const GATHER_RANGE = 1.5;

/** How often (in seconds) the enemy AI re-evaluates its behaviorMode. */
export const ENEMY_AI_DECISION_INTERVAL = 5;

/** Enemy walker count at/above which the AI switches to "fight" mode. */
export const ENEMY_AI_AGGRESSION_THRESHOLD = 4;

/**
 * Distance (in tiles) at which an opposing walker near one of the enemy's
 * houses counts as an active threat — see enemyAi.ts. Forces "fight" mode
 * immediately, regardless of ENEMY_AI_AGGRESSION_THRESHOLD, so the enemy
 * doesn't sit in "settle" while a house is under siege just because its
 * total walker count hasn't reached the usual aggression bar.
 */
export const ENEMY_AI_THREAT_RADIUS = 4;

/** Mana cost of conjuring a swamp — a "中" tier miracle, similar to an earthquake. */
export const SWAMP_MANA_COST = 15;

/** Radius (in tiles) a conjured swamp drowns walkers within. */
export const SWAMP_RADIUS = 1.2;

/** How many walkers a swamp swallows before it dries up and disappears. */
export const SWAMP_CAPACITY = 5;

/**
 * Mana cost of knighting the leader — "大" tier, on par with a volcano:
 * a single relentless, swamp-immune attacker that keeps destroying enemy
 * walkers and houses without further mana until it's killed.
 */
export const KNIGHT_MANA_COST = 35;

/**
 * Mana cost of a volcano — "大" tier, pricier than earthquake/swamp since
 * it denies land outright rather than just disrupting it temporarily.
 */
export const VOLCANO_MANA_COST = 40;

/**
 * Mana cost of a flood — "特大" tier, the priciest miracle short of the
 * final battle, since it endangers the caster's own low-lying land too.
 */
export const FLOOD_MANA_COST = 70;

/**
 * Mana cost of triggering the final battle — "最大" tier, the priciest
 * miracle of all, matching docs/game-system.md's "人口で明確に勝っている
 * ときの「決着ボタン」": affordable only once a faction's mana lead (itself
 * driven by population) is already decisive.
 */
export const ARMAGEDDON_MANA_COST = 120;

/**
 * Mana never accumulates past this — per docs/game-system.md, "画面上に
 * マナゲージがあり、ゲージ上に各奇跡のアイコンが並ぶ...右端＝最大コスト
 * （最終決戦）": the gauge's right edge is the priciest miracle, not an
 * open-ended number. Without a cap, a long-running match's ever-growing
 * population income lets mana pile up far past any single miracle's cost,
 * making the whole cost-gating pointless (e.g. stockpiling enough to cast
 * earthquake back-to-back indefinitely).
 */
export const MAX_MANA = ARMAGEDDON_MANA_COST;

/**
 * Population lead (own ÷ opponent) at which the enemy AI goes for
 * 最終決戦 instead of routine play — see enemyMiracles.ts. 1.8 matches
 * docs/game-system.md's "決着ボタン" framing: affordable only once a
 * lead is already decisive, not a coin-flip finish.
 */
export const ARMAGEDDON_POPULATION_RATIO = 1.8;

/**
 * Population lead at which the enemy AI escalates from earthquake to
 * volcano — see enemyMiracles.ts. Sits between "even game" (1.0) and
 * ARMAGEDDON_POPULATION_RATIO: a real but not yet decisive advantage, at
 * which permanently denying the opponent land is worth the extra mana
 * over just temporarily disrupting it.
 */
export const VOLCANO_POPULATION_RATIO = 1.3;
