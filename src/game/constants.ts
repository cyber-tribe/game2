import type { TerrainEditRule, TerrainType } from "../world/heightmap";
import type { HouseLevel } from "./components";

/** Tiles per second for a freshly spawned walker. */
export const DEFAULT_WALKER_SPEED = 1.5;

/**
 * Tiles per second for every walker once 最終決戦 has been triggered —
 * see armageddon.ts and plan/0046-final-battle-pacing.md. Slower than
 * DEFAULT_WALKER_SPEED: measured with the mana/pacing fixes in plan/0043-
 * 0045 already in place, the final battle itself (armageddon → game over)
 * still only took ~22s on average, mostly spent marching to the center —
 * once everyone arrived, combat resolved in a couple of ticks. Applies to
 * every walker on both sides, including ones that already existed before
 * armageddon was cast, so the whole climax — not just the newly-converted
 * houses — takes long enough to feel like the finale it's meant to be.
 */
export const FINAL_BATTLE_WALKER_SPEED = 0.5;

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
 * How often each TerrainEditRule (see world/heightmap.ts) is picked for a
 * fresh match — weighted so most matches play like today (unrestricted),
 * while a real minority give the terraforming loop a one-directional twist.
 * Consumed by main.ts's pickRandomTerrainEditRule.
 */
export const TERRAIN_EDIT_RULE_WEIGHTS: Record<TerrainEditRule, number> = {
  both: 2,
  raiseOnly: 1,
  lowerOnly: 1,
};

/** Japanese display name for each terrain-edit rule, shown in the HUD so a restriction is never a silent mystery. */
export const TERRAIN_EDIT_RULE_LABELS: Record<TerrainEditRule, string> = {
  both: "隆起・沈降とも可",
  raiseOnly: "隆起のみ可",
  lowerOnly: "沈降のみ可",
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

/** Japanese display name for each house level, per docs/game-system.md's own wording (5節). */
export const HOUSE_LEVEL_LABELS: Record<HouseLevel, string> = {
  hut: "小屋",
  lodge: "中規模の家",
  manor: "大きな家",
  castle: "城砦",
};

/**
 * Minimum house.population / capacity fraction releasePopulation requires
 * before it'll empty a house early — see that function's doc comment.
 * Below this, giving up the house's progress toward a real, full-strength
 * spawn isn't judged worth the walker it would produce.
 */
export const POPULATION_RELEASE_MIN_FRACTION = 0.5;

/**
 * Share of a released walker's population fraction that becomes its
 * strength — see releasePopulation. Kept below 1 so cashing population out
 * early is a genuine trade-off (a weaker walker, sooner) against letting a
 * house grow all the way to capacity on its own (strength 1, per
 * createHouseGrowthSystem) — not a strictly better way to grow.
 */
export const POPULATION_RELEASE_EFFICIENCY = 0.75;

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

/**
 * Radius (in tiles) of the farmland tint EntityLayer draws around each
 * house — docs/game-system.md 5節's "家の周囲は農地になり、視覚的に
 * 勢力圏を示す". Scales with house level, same idea as HOUSE_PATTERN_
 * WIDTH's sprite-size progression: a castle's territory should read as
 * larger than a hut's, not just its building.
 */
export const FARMLAND_RADIUS: Record<HouseLevel, number> = {
  hut: 1,
  lodge: 1.5,
  manor: 2,
  castle: 2.5,
};

/** A walker and an enemy walker/house within this many tiles fight it out. */
export const COMBAT_RANGE = 0.5;

/**
 * Seconds an ImpactEffect (see systems/effects.ts) stays on screen before
 * effectAgingSystem destroys it — a kill/capture/drowning's visible
 * lifetime is brief on purpose: it's a punctuation mark on the moment it
 * happened, not a lingering marker of the spot.
 */
export const IMPACT_EFFECT_DURATION = 0.5;

/**
 * Placeholder land-scarcity proxy: roughly how many map tiles a faction
 * needs per house it's allowed to build, used to derive
 * HouseGrowthConfig.maxHousesPerFaction from world size until real
 * terrain-based flat-land scarcity is implemented.
 *
 * Raised from 8 to 12 alongside the map going from 20x20 to 32x32
 * (plan/0055-map-expansion.md), then to 48 when every world became a fixed
 * 64x64 (plan/0062-original-scale-map.md) — in both cases deliberately
 * scaled right along with the tile count (so maxHousesPerFaction itself
 * stays roughly flat, ~85, across all three sizes) rather than growing
 * with it. A bigger map is meant to buy more geographic space (room for
 * front lines, travel distance between shrines, terrain features) per
 * docs/game-system.md's own framing of what a larger world is for, not a
 * proportionally larger army: maxHousesPerFaction (and so, indirectly, how
 * many walkers can ever exist at once) drives the cost of the O(n²)
 * combat/gather systems.
 */
export const TILES_PER_HOUSE_CAP = 48;

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
 * Mana cost of turning the leader into a guardian — "中〜大" tier, cheaper
 * than knight since its usefulness is situational (see GUARDIAN_DEFENSE_
 * RADIUS): it only fights back when the enemy actually comes to it, rather
 * than knighting's unconditional, go-anywhere aggression. See hero.ts's
 * guardianify/systems/hero.ts's guardianTargetingSystem.
 */
export const GUARDIAN_MANA_COST = 25;

/**
 * Distance (in tiles) from any of a faction's own houses within which a
 * guardian will engage an enemy walker/house — see systems/hero.ts's
 * guardianTargetingSystem. Beyond this, a guardian stands its ground rather
 * than chasing, unlike a knight (see knightTargetingSystem), which always
 * hunts the nearest enemy anywhere on the map — this is the whole
 * behavioral difference between the two hero kinds. Matches ENEMY_AI_
 * THREAT_RADIUS's scale, since both describe "close enough to a house to
 * count as a threat to it".
 */
export const GUARDIAN_DEFENSE_RADIUS = 4;

/**
 * Seconds a hero rests after resolving a house (a knight burning it, or a
 * guardian capturing one) before its targeting system sends it after its
 * next target — see knightTargetingSystem/guardianTargetingSystem's doc
 * comments. Without this, a hero instantly retargets and marches on arrival
 * every tick, so a single one could burn/capture through a whole
 * undefended settlement in seconds, collapsing the "小競り合い→復興/逆転"
 * phases a match is meant to have into a single instant (see
 * plan/0044-knight-cooldown.md). Matches the scale of other AI decision
 * intervals in this file (ENEMY_AI_DECISION_INTERVAL etc.) rather than
 * being a much larger, separate design.
 */
export const HERO_ACTION_COOLDOWN = 6;

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
 * Seconds since match start before the enemy AI will trigger 最終決戦,
 * however lopsided ARMAGEDDON_POPULATION_RATIO already is — see
 * enemyMiracles.ts, plan/0045-armageddon-timing.md, and plan/0053-
 * match-length-tuning.md. A match's early population numbers are noisy (a
 * house's in-progress population resets to 0 every time it overflows into
 * a walker) and can swing past the ratio within the first minute or two
 * purely by chance, well before either side has anything like a real
 * civilization — ending the whole match before the "繁栄"/"復興" phases a
 * match is meant to have ever get a chance to happen. This is a floor, not
 * a target length: the AI can still trigger armageddon any time after this
 * once the ratio holds, it just can't end the match before then purely
 * because of early noise.
 *
 * Raised from 180s (3 minutes) to 600s (10 minutes) once the 180s floor
 * was measured to no longer be the binding constraint — an AI-vs-AI match
 * (see plan/0053-match-length-tuning.md's measurement method) was already
 * averaging ~250s on its own by the time ARMAGEDDON_POPULATION_RATIO was
 * actually reached, well past the old floor. 600s pushes the measured
 * average to ~680s (~11-12 minutes), inside the 10-15 minute range a
 * single match is meant to run.
 */
export const MIN_ARMAGEDDON_TIME = 600;

/**
 * Population lead at which the enemy AI escalates from earthquake to
 * volcano — see enemyMiracles.ts. Sits between "even game" (1.0) and
 * ARMAGEDDON_POPULATION_RATIO: a real but not yet decisive advantage, at
 * which permanently denying the opponent land is worth the extra mana
 * over just temporarily disrupting it.
 */
export const VOLCANO_POPULATION_RATIO = 1.3;
