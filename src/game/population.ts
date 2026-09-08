import type { World } from "../ecs";
import { House, Owner, Walker, type FactionId } from "./components";

/**
 * How many followers one walker *is*.
 *
 * Walker.strength is a head count, not an abstract stat: houseGrowth spawns
 * everyone at 1, gatherSystem adds the two together when two walkers merge,
 * and combat subtracts the loser's count from the winner's. A walker of
 * strength 8 is eight people who walked into each other, so it counts as
 * eight.
 *
 * This used to be a flat 1 per walker, which made 集結 and 合体 *destroy*
 * population on paper — merging eight people into one hero cut the faction's
 * reported numbers by seven and, through manaSystem below, cut its income
 * too. The order the original calls 「強力なヒーローを生み出すのに不可欠な
 * 操作」 cannot be the one that starves you.
 */
export function walkerFollowers(walker: Walker): number {
  return walker.strength;
}

/**
 * A faction's total population: every house's accumulated `population`
 * plus every follower out on the field — see docs/game-system.md's
 * "両陣営の総人口の比較表示". Shared by the HUD's population-comparison
 * display, manaSystem (「マナは信者数と時間経過に応じて蓄積される」) and
 * enemyMiracles.ts's armageddon-timing decision, which all need the exact
 * same number. One definition of 信者数, used everywhere.
 */
export function totalPopulation(world: World, faction: FactionId): number {
  return housedPopulation(world, faction) + fieldPopulation(world, faction);
}

/** The half of totalPopulation that lives indoors. */
export function housedPopulation(world: World, faction: FactionId): number {
  let total = 0;
  for (const entity of world.query(House, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) total += world.get(entity, House)!.population;
  }
  return total;
}

/** The half of totalPopulation that is out walking around. */
export function fieldPopulation(world: World, faction: FactionId): number {
  let total = 0;
  for (const entity of world.query(Walker, Owner)) {
    if (world.get(entity, Owner)!.faction !== faction) continue;
    total += walkerFollowers(world.get(entity, Walker)!);
  }
  return total;
}
