import type { World } from "../ecs";
import { House, Owner, Position, Walker, type FactionId } from "./components";
import {
  DEFAULT_WALKER_SPEED,
  HOUSE_LEVELS,
  POPULATION_RELEASE_EFFICIENCY,
  POPULATION_RELEASE_MIN_FRACTION,
} from "./constants";

/**
 * The "人口放出" action: immediately empties every one of a faction's
 * houses that has grown enough to be worth it into a fresh walker, rather
 * than waiting for createHouseGrowthSystem to fill it to capacity on its
 * own. Free, like Simulation.setBehaviorMode — this is a standing power,
 * not a mana-gated miracle — but not a pure win either: a released
 * walker's strength is only POPULATION_RELEASE_EFFICIENCY of the
 * population it was built from (see that constant), permanently weaker
 * than the strength-1 walker the same house would eventually produce on
 * its own. That's the trade this exists for — a faction can bleed
 * population out early for more, sooner, weaker walkers (faster
 * settling/expansion, since settle.ts's createSettleSystem doesn't care
 * about a walker's strength) instead of letting it accumulate into fewer,
 * stronger ones.
 *
 * A house only releases once its population/capacity ratio has reached
 * POPULATION_RELEASE_MIN_FRACTION — otherwise this would let a faction
 * shred a house's progress into an unbounded stream of near-worthless
 * walkers, each still capable of founding a whole new house per
 * settle.ts, far faster than createHouseGrowthSystem's capacity-gated
 * pacing ever allows. Skipped entirely once the faction is already at
 * maxWalkersPerFaction, for the same reason createHouseGrowthSystem stops
 * spawning walkers there — see MAX_WALKERS_PER_FACTION: past that point
 * more walkers are a performance problem, whoever created them.
 *
 * Returns how many walkers were actually released, so callers can skip
 * feedback (haptics, etc.) when nothing happened.
 */
export function releasePopulation(world: World, faction: FactionId, maxWalkersPerFaction: number): number {
  let walkerCount = 0;
  for (const entity of world.query(Walker, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) walkerCount++;
  }
  if (walkerCount >= maxWalkersPerFaction) return 0;

  let released = 0;
  for (const entity of world.query(House, Position, Owner)) {
    if (world.get(entity, Owner)!.faction !== faction) continue;
    // Re-checked per house, not just once up front: a faction a few
    // walkers short of the ceiling with a hundred full houses must not
    // vault over it in a single tap.
    if (walkerCount >= maxWalkersPerFaction) break;

    const house = world.get(entity, House)!;
    const pos = world.get(entity, Position)!;
    const capacity = HOUSE_LEVELS[house.level].capacity;
    const fraction = house.population / capacity;
    if (fraction < POPULATION_RELEASE_MIN_FRACTION) continue;

    const walker = world.createEntity();
    world.add(walker, Position, { x: pos.x, y: pos.y });
    world.add(walker, Owner, { faction });
    world.add(walker, Walker, {
      strength: fraction * POPULATION_RELEASE_EFFICIENCY,
      state: "seeking",
      speed: DEFAULT_WALKER_SPEED,
    });

    world.add(entity, House, { level: house.level, population: 0 });
    released++;
    walkerCount++;
  }

  return released;
}
