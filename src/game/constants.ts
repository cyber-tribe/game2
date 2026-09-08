import type { TerrainEditRule, TerrainType } from "../world/heightmap";
import type { HeroKind, HouseLevel } from "./components";
import type { EnemyPersonality } from "./worlds";

/**
 * How far from its shrine each of a faction's starting walkers is placed,
 * in tiles — see Simulation's spawnWalkers.
 *
 * Small: they are meant to read as a group gathered at the shrine, not as
 * a scattered patrol. It only has to be big enough that they are not
 * standing *inside each other*, which is what they used to do.
 */
export const INITIAL_WALKER_SPREAD = 1.5;

/**
 * How close to an existing house a walker may settle, in tiles — see
 * systems/settle.ts.
 *
 * There was no such rule, so walkers standing on the same spot founded
 * houses on the same spot: measured on the final world, one faction held
 * three houses at *identical* coordinates at 40 seconds. Stacked houses
 * are invisible (they draw on top of each other), pay full mana each, and
 * — the reason this is a fix rather than tidying — die together to
 * anything with a radius.
 */
export const HOUSE_SPACING = 1;

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
 * Minimum house.population / capacity fraction sprogHouse requires before
 * it'll push anyone out early — see that function's doc comment. Below
 * this, giving up the house's progress toward a real, full-strength spawn
 * isn't judged worth the walker it would produce.
 */
export const POPULATION_RELEASE_MIN_FRACTION = 0.5;

/**
 * Share of a released walker's population fraction that becomes its
 * strength — see sprogHouse. Kept below 1 so cashing population out early
 * is a genuine trade-off (a weaker walker, sooner) against letting a house
 * grow all the way to capacity on its own (strength 1, per
 * createHouseGrowthSystem) — not a strictly better way to grow.
 */
export const POPULATION_RELEASE_EFFICIENCY = 0.75;

/**
 * How much of a house's population one スプログ pushes out — the original
 * says 「信者の**一部**が追い出される」, not all of them. Half leaves the
 * house still standing on real progress rather than back at zero, which is
 * what makes the command "don't wait for capacity" instead of "cash this
 * house in". Taking a share of what is *left* each time also makes repeated
 * presses run themselves dry: a full house yields two walkers before it
 * drops under POPULATION_RELEASE_MIN_FRACTION and refuses.
 */
export const SPROG_FRACTION = 0.5;

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

/**
 * Mana per second from one follower who is out on the field rather than
 * living in a house — 「マナは**信者数**と時間経過に応じて蓄積される」.
 *
 * Exactly what that person produced while indoors in a hut
 * (manaRate / capacity), so stepping outside is income-neutral. It used to
 * be a total loss: a walker only ever *left* a house, taking its share of
 * that house's population with it, so mustering an army or sprogging a town
 * cut the faction's income to nothing while the people involved were still
 * very much alive and still believers. The original praises スプログ for
 * making the game move faster; it cannot be the button that bankrupts you.
 *
 * Counted inside HUT_MANA_RATE_CAP rather than beside it (see manaSystem):
 * people standing in a field are the least-developed state a faction's
 * population can be in, so they belong under the same ceiling as its
 * least-developed housing. Letting them earn outside it would mean emptying
 * every hut out-earned upgrading them.
 */
export const FOLLOWER_MANA_RATE = HOUSE_LEVELS.hut.manaRate / HOUSE_LEVELS.hut.capacity;

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
 * Seconds a walker can survive standing in a genuine body of water (see
 * world/heightmap.ts's isInWaterPool) before drowning — see
 * systems/drowning.ts. At DEFAULT_WALKER_SPEED (1.5 tiles/s) that's 6
 * tiles' worth of travel, long enough for a walker caught at the edge of a
 * freshly-dug pond a real chance to reach dry land, per feedback: "基本は
 * 溺れてもエネルギーが0になるまでは生きており陸に上がると普段の動きに
 * 戻る" — not so long it stops reading as a real hazard.
 */
export const DROWNING_BREATH_SECONDS = 4;

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

/**
 * How far a walker under 合体 will go looking for someone to merge with —
 * 「**近くにいる**信者達と合体し、その力を増していく」
 * (systems/mergeTargeting.ts).
 *
 * A neighbourhood, not the map. Unbounded, 合体 would be strictly better
 * than 集合 — every walker on the board would converge into one titan with
 * no flag to plant and no pause in building — and the order the original
 * actually describes is a local one, which is why it has a "nobody nearby"
 * case at all. Slightly wider than DEFAULT_WANDER_RADIUS so that walkers
 * which would have wandered within sight of each other close instead.
 */
export const MERGE_SEEK_RADIUS = 8;

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
/**
 * Houses the enemy wants before it will leave home to attack — see
 * systems/enemyAi.ts. Being attacked overrides it.
 *
 * Fixes an inversion in the difficulty curve. "fight" is a faction-wide
 * instruction: while it is set, nobody settles. The enemy went aggressive
 * purely on walker count, and the harder worlds set that threshold
 * *lower* (6 on the first world, 2 on the last), so the hardest world's
 * enemy abandoned building at two walkers and never came back — it spent
 * the match raiding with whatever it had while its economy stayed at
 * nothing. The "harder" setting made the enemy poorer, not stronger.
 *
 * Measured with neither side played, on the hardest enemy settings
 * (decisionInterval 2, aggressionThreshold 2), houses after 7 minutes:
 *
 * | floor | grass: enemy / player | rock: enemy / player |
 * |-------|-----------------------|----------------------|
 * | 0 (before) | 32.4 / 85        | 24.2 / 37.8          |
 * | 8     | 75.2 / 69.4           | 42.4 / 85            |
 * | **16**| **83.8 / 63.6**       | **61.0 / 82.9**      |
 *
 * Sixteen rather than eight because rock — the terrain the last two
 * worlds use — is where the collapse was worst, and eight only half
 * fixes it there (42 houses against 85). Values between 8 and 20 sit
 * inside the run-to-run spread on grass, so this is picked on the rock
 * measurement, at 12 runs.
 *
 * The player's own count falling (85 to 63.6 on grass) is the point
 * rather than a side effect: an enemy that built first now has something
 * to attack with, and a player who does nothing for seven minutes should
 * be losing houses.
 */
export const ENEMY_AI_ECONOMY_FLOOR = 16;

export const ENEMY_AI_THREAT_RADIUS = 4;

/** Mana cost of conjuring a swamp — a "中" tier miracle, similar to an earthquake. */
export const SWAMP_MANA_COST = 15;

/** Radius (in tiles) a conjured swamp drowns walkers within. */
export const SWAMP_RADIUS = 1.2;

/** How many walkers a swamp swallows before it dries up and disappears. */
export const SWAMP_CAPACITY = 5;

/** How far from its cast point a 聖水の泉 converts walkers — see holyWater.ts. */
export const HOLY_WATER_RADIUS = 1.5;

/**
 * How many walkers one 聖水の泉 takes before it dries up.
 *
 * Deliberately small. The spring's value is not volume — it is *which*
 * walker falls in, and the original says so: 「強い英雄を奪えば形勢逆転
 * できる」. At 3, one well-placed spring can take a hero and a couple of
 * its escort, which is a turning point; at 20 it would quietly digest a
 * whole army and the placement would stop mattering.
 */
export const HOLY_WATER_CAPACITY = 3;

/**
 * Mana cost of a 聖水の泉 — "大" tier, above a swamp.
 *
 * A swamp of the same size deletes what walks in; this takes it and hands
 * it back pointed the other way, which is worth roughly twice as much in a
 * fight (their strongest unit leaves their side *and* joins yours). Priced
 * to be a decision rather than a habit: at 45 it is not something to leave
 * lying around on the off-chance.
 */
export const HOLY_WATER_MANA_COST = 45;

/**
 * Mana cost of turning the leader into ペルセウス — "大" tier, on par with
 * a volcano: a single relentless attacker that keeps destroying enemy
 * walkers and houses without further mana until it's killed (though, like
 * anyone else, it can still drown in a swamp — see systems/swamp.ts).
 *
 * Unchanged from what 騎士化 cost before the heroes had names. ペルセウス
 * is the original's own "基準の英雄" (docs/original-miracles.md #3), and a
 * baseline that moved when it was renamed would be no baseline at all: the
 * other three are priced against this one.
 */
export const PERSEUS_MANA_COST = 35;

/**
 * Mana cost of ヘラクレス — the priciest hero, and the only one that is
 * simply *better* in a fight (HERO_TRAITS gives it double strength) rather
 * than better at one specific thing. It also walks over an earthquake's
 * crevices unharmed (systems/crevice.ts), which is what makes it worth
 * more than the strength alone: it is the answer to a map the enemy has
 * already torn open, where every other hero has to walk around.
 */
export const HERCULES_MANA_COST = 50;

/**
 * Mana cost of オディッセウス — the cheapest hero. Speed alone wins no
 * fight it would otherwise lose, and priced any higher nobody would take
 * mobility over ペルセウス's plain reliability. Cheap enough to be the
 * hero you cast when the enemy is far away and the map is wide.
 */
export const ODYSSEUS_MANA_COST = 30;

/**
 * Mana cost of アキレス — above ペルセウス, below ヘラクレス. Fire
 * immunity is worth nothing at all against an enemy who never casts fire,
 * and decisive against one who does: an アキレス walks through their own
 * forest as it burns (game/fire.ts). Situational power is priced between
 * "reliable" and "simply stronger".
 */
export const ACHILLES_MANA_COST = 40;

/**
 * Mana cost of turning the leader into a guardian — "中〜大" tier, cheaper
 * than knight since its usefulness is situational (see GUARDIAN_DEFENSE_
 * RADIUS): it only fights back when the enemy actually comes to it, rather
 * than knighting's unconditional, go-anywhere aggression. See hero.ts's
 * guardianify/systems/hero.ts's guardianTargetingSystem.
 */
/**
 * Mana cost of アドニス — above ペルセウス, below ヘラクレス.
 *
 * On paper it is a ペルセウス that multiplies, which sounds like the best
 * hero in the game; in practice every extra body is one more chance to pay
 * HERO_DEATH_MANA_LOSS, and they are all half strength. The price is for
 * the upside, the mana loss is the downside, and the original says both in
 * the same breath: 「増やしすぎは英雄死亡時のマナ損失というリスクを伴う」.
 */
export const ADONIS_MANA_COST = 42;

/**
 * Mana a faction loses whenever one of its heroes dies — the risk half of
 * アドニス (docs/original-miracles.md #10).
 *
 * Applies to every hero, not only アドニス. The original raises it as
 * アドニス's own drawback, but a rule that only charged for *that* hero's
 * deaths would be a tax on one miracle rather than what it plainly is:
 * heroes are an investment, and losing one costs you.
 *
 * Set below what any hero costs to cast, so dying is a setback rather than
 * a second purchase — but high enough that splitting アドニス into four
 * bodies and marching them all into a swamp is a real, felt mistake.
 */
export const HERO_DEATH_MANA_LOSS = 12;

/**
 * Strength below which アドニス stops splitting.
 *
 * Halving has no floor of its own: without this, a hero that keeps winning
 * ends up as a crowd of thirty-second-strength heroes, individually too
 * weak to beat a single walker and collectively a standing mana liability
 * (see HERO_DEATH_MANA_LOSS). One at a strength of 1 is exactly a plain
 * walker, so that is where the doubling stops paying for itself.
 */
export const ADONIS_MIN_SPLIT_STRENGTH = 1;

/** How far apart the two halves of a split アドニス are placed, in tiles. */
export const ADONIS_SPLIT_GAP = 0.6;

/**
 * Mana cost of トロイのヘレン — the cheapest hero after オディッセウス.
 *
 * She kills nothing and takes nothing permanently: everyone she holds is
 * still the enemy's, still alive, and comes straight back the moment she
 * dies. What she buys is *time* — an enemy settlement whose people are
 * being walked away from it stops growing — and time is worth less than a
 * kill, so she is priced under the heroes that make them.
 */
export const HELEN_MANA_COST = 32;

/**
 * How far トロイのヘレン's charm reaches, in tiles.
 *
 * Deliberately far larger than COMBAT_RANGE. She cannot fight at all (see
 * systems/helen.ts), so an enemy that gets close enough to touch her kills
 * her; the charm has to land first, or she is simply the worst hero in the
 * game. At this radius an approaching walker is taken several ticks before
 * it is in reach.
 */
export const HELEN_CHARM_RADIUS = 3;

/**
 * How many enemy walkers トロイのヘレン can hold at once.
 *
 * The limit is what keeps her from quietly absorbing an entire army, and
 * it is also what can get her killed: the enemy she has no room left for
 * walks right up to her. Casting her into a crowd is a gamble, which is
 * the shape a hero who cannot fight ought to have.
 */
export const HELEN_CHARM_CAPACITY = 4;

/** How closely a charmed walker trails トロイのヘレン, in tiles. */
export const HELEN_FOLLOW_DISTANCE = 1;

/**
 * How close a walker トロイのヘレン has charmed must come to one of its own
 * side's houses to pull it down — 「敵信者を魅了して**建物を更地にさせ**、
 * 信者が死ぬまで外を連れ回し続ける」.
 *
 * Small: they have to actually reach the building, not merely be led past
 * the settlement. Helen takes people where they stand, which is normally at
 * home, and then walks them out — so the razing happens on the way out,
 * once, rather than being a radius she sweeps a town with.
 */
export const HELEN_RAZE_RADIUS = 1.2;

export const GUARDIAN_MANA_COST = 25;

/**
 * What each hero kind multiplies its leader's strength and speed by when
 * the miracle lands — see hero.ts's promoteHero.
 *
 * Only ヘラクレス and オディッセウス move a number at all; every other
 * hero's identity is a *rule* somewhere else (アキレス does not burn,
 * ペルセウス and 守護者 differ in where they will go), which is the whole
 * reason the original's heroes read as different characters rather than as
 * one hero at four price points. A stat table is the wrong shape for most
 * of what makes them different, so it deliberately holds only the two
 * traits that genuinely are numbers.
 *
 * ペルセウス and 守護者 sit at 1x on purpose: they are exactly the 騎士 and
 * 守護者 that already existed, so no existing match plays differently for
 * having renamed them.
 */
export const HERO_TRAITS: Record<HeroKind, { strength: number; speed: number }> = {
  // 「戦闘力が最も高い」 — the one hero that simply out-fights the others.
  hercules: { strength: 2, speed: 1 },
  // 「移動速度が速い」. Compounds with ROAD_SPEED_MULTIPLIER rather than
  // replacing it: an オディッセウス on a road is the fastest thing on the
  // map, which is exactly the reading of two mobility effects meeting.
  odysseus: { strength: 1, speed: 1.8 },
  perseus: { strength: 1, speed: 1 },
  achilles: { strength: 1, speed: 1 },
  // ヘレン's trait is not a number either — it is that she never fights.
  helen: { strength: 1, speed: 1 },
  // アドニス's trait is not a number at all — it is what happens after a
  // won fight (systems/combat.ts). Promoting simply makes the leader one.
  adonis: { strength: 1, speed: 1 },
  guardian: { strength: 1, speed: 1 },
};

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
 * How much faster a house surrounded by woodland grows — the original's 森
 * (docs/original-miracles.md #6). Deliberately worth casting but not
 * decisive on its own: the forest's other half is that it burns, and a
 * growth bonus so large that nobody would ever risk losing it would kill
 * the 森 -> 火の雨 interaction the miracle exists for.
 */
export const FOREST_GROWTH_MULTIPLIER = 1.5;

/** Mana cost of planting a forest — cheap, since its payoff is slow and it can be turned against its owner. */
export const FOREST_MANA_COST = 10;

/**
 * Mana cost of a flower. Cheap relative to what it undoes, deliberately:
 * it repairs one small patch, while an earthquake tears a long fissure and
 * a volcano buries a valley. Pricing it against the damage it can reverse
 * would make repairing a ruined map impossible in practice.
 */
export const FLOWER_MANA_COST = 8;

/** Mana cost of fire rain — mid-tier on its own, but a forest multiplies what it reaches. */
export const FIRE_RAIN_MANA_COST = 25;

/**
 * Mana cost of a tsunami — "特大" tier, the priciest miracle short of the
 * final battle. It no longer endangers the caster's own land automatically
 * (it is aimed now, see applyTsunami), but it can erase a whole coastal
 * settlement in one cast, so the price stands.
 */
export const TSUNAMI_MANA_COST = 70;

/**
 * Mana cost of a reef. Cheap on purpose: the original notes 岩礁 as a
 * low-cost miracle, and its whole role here is to be worth building
 * *before* an enemy tsunami rather than a reaction to one — a defence the
 * player cannot afford to pre-place is not a defence.
 */
export const REEF_MANA_COST = 12;

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

/**
 * How much an EnemyPersonality (see worlds.ts) biases enemyMiracles.ts's
 * escalation math, on top of (not instead of) the per-world difficulty
 * knobs above — the qualitative "character" axis docs/game-system.md's
 * 敵AI section was missing (see plan/0072-enemy-personality.md): earlier
 * worlds all played the exact same way, just faster/more trigger-happy.
 *
 * - `volcanoRatioMultiplier`/`armageddonRatioMultiplier` scale
 *   VOLCANO_POPULATION_RATIO/ARMAGEDDON_POPULATION_RATIO: below 1 the
 *   personality commits to that escalation with a smaller lead than
 *   normal (more trigger-happy), above 1 it holds out for a bigger one
 *   (more cautious).
 * - `heroPreferenceBias` shifts the population-ratio line enemyMiracles.ts
 *   draws between "prefer guardian" (defend) and "prefer knight" (attack):
 *   a faction is read as "behind" (guardian) when its ratio is below
 *   `1 + heroPreferenceBias`. Negative narrows that window (turtles only
 *   when genuinely losing, attacks otherwise); positive widens it (turtles
 *   readily, attacks only once clearly ahead).
 *
 * "balanced" is exactly 1/1/0 — today's original thresholds, unchanged —
 * so it's both a safe default for tests and the right choice for worlds
 * too early (no hero/volcano/armageddon unlocked yet) for a personality to
 * have anything to season.
 */
export interface EnemyPersonalityTuning {
  volcanoRatioMultiplier: number;
  armageddonRatioMultiplier: number;
  heroPreferenceBias: number;
}

export const ENEMY_PERSONALITY_TUNING: Record<EnemyPersonality, EnemyPersonalityTuning> = {
  balanced: { volcanoRatioMultiplier: 1, armageddonRatioMultiplier: 1, heroPreferenceBias: 0 },
  // Commits to volcano/armageddon with a smaller lead, and only ever turtles
  // behind a guardian once genuinely losing (ratio < 0.7) rather than at
  // the first sign of not being ahead.
  aggressive: { volcanoRatioMultiplier: 0.85, armageddonRatioMultiplier: 0.85, heroPreferenceBias: -0.3 },
  // Holds out for a much bigger lead before volcano/armageddon, and turtles
  // behind a guardian readily (ratio < 1.3) — even a slight edge isn't
  // enough to make it commit to knighting instead.
  defensive: { volcanoRatioMultiplier: 1.3, armageddonRatioMultiplier: 1.2, heroPreferenceBias: 0.3 },
};

/** Japanese label for each EnemyPersonality, shown at world-select so a personality is never a silent mystery — same idea as TERRAIN_EDIT_RULE_LABELS. */
export const ENEMY_PERSONALITY_LABELS: Record<EnemyPersonality, string> = {
  balanced: "堅実",
  aggressive: "好戦的",
  defensive: "専守防衛",
};

/**
 * How much faster a walker standing on a road moves — the original's 道,
 * "上では信者の移動速度が上がる" (docs/original-miracles.md #11).
 *
 * Big enough to be worth a detour, small enough that a road is not a
 * replacement for settling closer: at 1.6x, crossing ten tiles of pavement
 * saves about the time it takes to walk four tiles of open ground.
 */
export const ROAD_SPEED_MULTIPLIER = 1.6;

/**
 * Mana cost of a road. Cheap, like the reef: its real value is the 毒カビ
 * it stops, which means it has to be affordable *before* an outbreak makes
 * it obviously necessary. A quarantine line the player can only pay for
 * after the rot arrives is not a quarantine line.
 */
export const ROAD_MANA_COST = 8;

/**
 * Mana cost of one block of 城壁 (five vertices — see DEFAULT_WALL_RADIUS).
 *
 * Priced per block, so a wall long enough to shut a settlement in costs
 * several times what breaking it does: 地震 is 20 and tears a crack ten
 * vertices long straight through one (see tearCrevice). That asymmetry is
 * deliberate and it is what keeps a wall from ending matches — walling an
 * enemy in has to be a way of buying time, never a way of winning without
 * fighting.
 */
export const WALL_MANA_COST = 12;

/**
 * Mana cost of one 地下巨石.
 *
 * Between the wall it resembles (12, breakable by any earthquake) and the
 * volcano it does not (40, which kills everything under it and runs lava
 * downhill besides). What this buys is permanence: nothing in this game
 * repairs a boulder — 花 does not touch it, and terraforming will not wear
 * it down — so a plot denied is denied until its owner digs it into the
 * sea. That is worth more than a wall and less than a life.
 */
export const MEGALITH_MANA_COST = 24;

/**
 * The enemy god's own "screen", in tiles — see systems/aiViewport.ts for
 * what these two axes are and why the shape (not the size) is the point.
 *
 * Measured off the player's, rather than picked. The camera renders at a
 * fixed base scale (BASE_MAP_SCALE = 1) with 64x32 px tiles, so a screen
 * `width` x `height` pixels across shows `width / 32` tiles of (x - y)
 * and `height / 16` tiles of (x + y). On the 480x900 phone viewport this
 * game is built for that is 15 and 56.25 — a view four times longer than
 * it is wide, which is what an isometric screen is.
 *
 * Deliberately not tracking the human's actual camera: a player who
 * pinches out or rotates would otherwise hand the enemy god a longer
 * reach by doing so.
 */
export const ENEMY_VIEWPORT_ACROSS_TILES = 15;
export const ENEMY_VIEWPORT_ALONG_TILES = 56.25;

/**
 * Mana cost of one 毒カビ outbreak. Cheap on purpose, and the price is a
 * design statement: the original's "複数設置すると大繁殖" only means
 * anything if casting several in one place is a real option, so this is
 * priced per seed rather than per acre of eventual rot.
 */
export const FUNGUS_MANA_COST = 14;

/**
 * Seconds between growth steps of every 毒カビ patch — see
 * systems/fungus.ts and world/heightmap.ts's spreadFungus.
 *
 * A discrete generation clock, not a per-frame rate: the spread rule is a
 * cellular automaton, so stepping it per frame would tie how fast the rot
 * grows to how fast the machine draws. At 1.5s a patch left alone visibly
 * creeps over the course of a match without ever outrunning a player who
 * answers it.
 */
export const FUNGUS_GROWTH_INTERVAL = 1.5;

/**
 * How long a 竜巻 lives, in seconds — the original's 「一定時間ランダムに
 * 移動し」 (docs/original-miracles.md #17).
 *
 * Long enough that where it *ends up* is genuinely uncertain, which is the
 * point of a wandering hazard: a tornado you can aim precisely is just a
 * slow fire rain.
 */
export const TORNADO_LIFETIME = 14;

/** Tiles per second a 竜巻 drifts. Slower than a walker (DEFAULT_WALKER_SPEED), so people can outrun it if they notice it. */
export const TORNADO_SPEED = 1;

/** How far from its centre a 竜巻 catches walkers, in tiles. */
export const TORNADO_RADIUS = 1.5;

/**
 * How much strength a caught walker loses per second — the original's
 * 「信者を巻き込んで運び体力を減らす」.
 *
 * Damage over time rather than an instant kill, because the other half of
 * that sentence is *carrying*: a tornado that killed on contact would
 * never get to drag anyone anywhere, and dragging is what makes it a
 * different threat from fire rain. A full-strength walker survives a few
 * seconds inside one.
 */
export const TORNADO_DAMAGE_PER_SECOND = 0.5;

/** How fast a caught walker is dragged toward the 竜巻's centre, in tiles per second. */
export const TORNADO_DRAG_SPEED = 1.2;

/**
 * How sharply a 竜巻 wanders: the fraction of a right-angle turn it may
 * take per second. Low enough that its path reads as a drifting curve
 * rather than a random-number generator on legs.
 */
export const TORNADO_WANDER = 0.9;

/**
 * How long a 火柱 burns, in seconds.
 *
 * Shorter than a 竜巻's life. A tornado that wanders for a while and then
 * leaves is a scare; a pillar of fire that wanders for the same time
 * leaves a permanent scar the length of its path, and 「地面を荒地化」 has
 * to stay a wound rather than become the shape of the map.
 */
export const FIRE_PILLAR_LIFETIME = 9;

/** Tiles per second a 火柱 drifts. Slower than a walker, like the 竜巻 — it can be outrun. */
export const FIRE_PILLAR_SPEED = 0.9;

/** How far from its centre a 火柱 burns, in tiles. */
export const FIRE_PILLAR_RADIUS = 1.2;

/** How sharply a 火柱 wanders — see TORNADO_WANDER, same rule and the same reason. */
export const FIRE_PILLAR_WANDER = 1.1;

/**
 * Mana cost of a 火柱 — above fire rain.
 *
 * Fire rain is a bigger circle *once*; this is a smaller circle that keeps
 * moving for nine seconds, kills what it touches outright, and leaves the
 * ground it crossed unbuildable until somebody spends a 花 on it. The
 * lasting damage is what the extra mana buys.
 */
export const FIRE_PILLAR_MANA_COST = 32;

/** Mana cost of a 竜巻 — "中" tier. Cheaper than fire rain: it is slower, avoidable, and where it goes is not entirely up to the caster. */
/**
 * Seconds between the 渦巻き a tornado throws off while it is over open
 * water — 「海上では渦巻きを大量発生させるため、敵陣の海岸付近に大量に
 * 仕掛けると土地を広げにくくなるので効果的」.
 *
 * Sized against TORNADO_LIFETIME (14s) so a tornado that spends its whole
 * life at sea leaves a handful of whirlpools rather than one or a swarm.
 * Each of those then splits up to WHIRLPOOL_MAX_SPLITS times on its own, so
 * the 「大量」 is mostly what the whirlpools do afterwards; this is what
 * gives them something to start from.
 */
export const TORNADO_WHIRLPOOL_INTERVAL = 3.5;

export const TORNADO_MANA_COST = 22;

/** How long a 渦巻き lives once a 竜巻 reaches water, in seconds. */
export const WHIRLPOOL_LIFETIME = 16;

/** Tiles per second a 渦巻き moves over water. */
export const WHIRLPOOL_SPEED = 0.8;

/** How far from its centre a 渦巻き eats away at the coast, in tiles. */
export const WHIRLPOOL_RADIUS = 1.5;

/** Seconds between a 渦巻き splitting in two — the original's 「一定時間で分裂して被害範囲が広がる」. */
export const WHIRLPOOL_SPLIT_INTERVAL = 5;

/**
 * How many times a 渦巻き may split.
 *
 * Bounded, and low. Unbounded splitting is exponential: at 2 splits one
 * tornado that happens to reach the sea ends with 4 whirlpools, which is
 * already a coastline redrawn; at 5 it would be 32 and the map itself
 * would be the casualty regardless of what either side did afterwards.
 */
export const WHIRLPOOL_MAX_SPLITS = 2;

/**
 * How far a ハリケーン's gust reaches from its origin, in tiles — the
 * original's 「指定方向へ強風」 (docs/original-miracles.md #20).
 *
 * Long and narrow rather than a disc: this miracle is the one that *has* a
 * direction, and a wide blast would make aiming it pointless. The shape is
 * the miracle.
 */
export const HURRICANE_LENGTH = 12;

/** How far to either side of its axis the gust catches things, in tiles. */
export const HURRICANE_WIDTH = 2;

/**
 * How far a caught walker is thrown along the wind, in tiles.
 *
 * The whole point of the number: 「吹き飛ばす先に沼や亀裂を用意して即死地形
 * へ押し込む」 (docs/original-miracles.md's interaction table). Far enough
 * that a swamp or a crevice laid a few tiles downwind is a real plan, short
 * enough that the plan has to be laid in advance rather than improvised
 * mid-gust.
 */
export const HURRICANE_PUSH = 4;

/**
 * Mana cost of a ハリケーン — "中〜大".
 *
 * On its own it flattens a line of houses and scatters whoever was in it,
 * which is worth about a fire rain. What it is actually priced for is the
 * combination: with a swamp or an earthquake's crevice already downwind it
 * is a kill, and both of those cost mana of their own. Charging blast-tier
 * for it as well would make the combination cost more than the two
 * miracles it is made of.
 */
export const HURRICANE_MANA_COST = 28;

/**
 * How long one case of 病原菌 lasts before the carrier recovers, in
 * seconds — see the Infected component.
 *
 * The original does not mention recovery, but without it a plague only
 * ever grows: every walker and house on the map ends up infected, nobody
 * earns mana, and the match becomes two sides staring at each other. A
 * disease that burns out keeps the miracle's real shape —
 * 「即死ではなく国力を長期的に削る」 — while leaving a way back.
 */
export const PLAGUE_DURATION = 25;

/** How far 病原菌 reaches when first cast, in tiles. */
export const PLAGUE_RADIUS = 2.5;

/** How far an existing case can spread to someone else, in tiles. */
export const PLAGUE_SPREAD_RADIUS = 2;

/**
 * Chance per second that one infected walker or house passes it to a
 * particular healthy neighbour within PLAGUE_SPREAD_RADIUS.
 *
 * Low, and deliberately not the runaway 毒カビ's neighbour-scaled rate: a
 * plague that swept a settlement in seconds would be an area attack with
 * extra steps. Slow spread is what makes this the miracle you cast early
 * and forget about, and the one whose damage the other side notices late.
 */
export const PLAGUE_SPREAD_CHANCE = 0.12;

/**
 * Mana cost of 病原菌 — mid tier.
 *
 * It kills nothing and destroys nothing, so it can never win a fight on
 * its own; what it buys is the other side's economy for the next half
 * minute. Priced below the miracles that take something permanently.
 */
export const PLAGUE_MANA_COST = 26;

/**
 * How many bolts one 雷 throws — the original's 「指定地点周辺へ落雷」
 * (docs/original-miracles.md #16).
 *
 * Plural on purpose. A single bolt exactly on the tapped tile would be a
 * tiny fire rain; several scattered around it is what makes lightning feel
 * like lightning, and it is the shape the original's own level rule
 * describes (see LIGHTNING_SCATTER).
 */
export const LIGHTNING_BOLTS = 5;

/**
 * How far from the aim point a bolt may land, in tiles.
 *
 * This is the original's 「レベルが上がると威力ではなく**命中率**が向上
 * する」 expressed as the one thing game2 can express: the miracle is
 * *inaccurate*, and that inaccuracy is its character rather than a defect.
 * game2 has no miracle levels, so nothing shrinks this today — when levels
 * exist, this is the number they should move, and not the damage.
 */
export const LIGHTNING_SCATTER = 3;

/** How far each bolt kills, burns and scorches, in tiles. */
export const LIGHTNING_BOLT_RADIUS = 1;

/**
 * Mana cost of a 雷 — below fire rain.
 *
 * It covers a comparable area but cannot be aimed within it: half a
 * scattered strike lands on ground nobody cared about. The discount is for
 * the uncertainty, not for weakness.
 */
export const LIGHTNING_MANA_COST = 20;

/** How long a 嵐's cloud sits over its ground, in seconds. */
export const STORM_LIFETIME = 12;

/** Seconds between a 嵐's strikes. */
export const STORM_STRIKE_INTERVAL = 0.8;

/** How far from the cloud's centre its bolts can land, in tiles. */
export const STORM_RADIUS = 4;

/**
 * Mana cost of a 嵐 — above 雷 and above fire rain.
 *
 * It denies a whole area for twelve seconds and leaves it barren, which is
 * worth more than any single strike. What it does *not* do is kill anyone
 * (「この雷は人には直接当たらない」), so it is priced as area denial
 * rather than as a bigger 雷.
 */
export const STORM_MANA_COST = 38;
