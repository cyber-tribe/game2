import type { System, World } from "../../ecs";
import { DEFAULT_POPULATION_GROWTH_RATE, DEFAULT_WALKER_SPEED, HOUSE_LEVELS } from "../constants";
import { House, Owner, Position, type FactionId, Walker } from "../components";

export interface HouseGrowthConfig {
  /** Population units accumulated per second, before scaling by house level. */
  growthRate: number;
  /**
   * Caps how many houses a single faction may spawn walkers to build.
   * Real land scarcity (running out of flat ground) isn't modeled yet —
   * see docs/game-system.md — so this stands in for it: without some cap,
   * population compounds exponentially forever and the O(entities) systems
   * (combat, house capture) eventually grind the simulation to a halt.
   * A house at the cap keeps accumulating population but stops spawning;
   * growth resumes automatically if the faction loses a house (e.g. to
   * capture) and drops back under the cap.
   */
  maxHousesPerFaction: number;
}

export function createHouseGrowthSystem(config: Partial<HouseGrowthConfig> = {}): System {
  const growthRate = config.growthRate ?? DEFAULT_POPULATION_GROWTH_RATE;
  const maxHousesPerFaction = config.maxHousesPerFaction ?? Infinity;

  return (world, deltaSeconds) => {
    const houseCountByFaction = countHousesByFaction(world);

    for (const entity of world.query(House, Position, Owner)) {
      const house = world.get(entity, House)!;
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const capacity = HOUSE_LEVELS[house.level].capacity;

      let population = house.population + growthRate * deltaSeconds;

      while (
        population >= capacity &&
        (houseCountByFaction.get(owner.faction) ?? 0) < maxHousesPerFaction
      ) {
        population -= capacity;
        spawnWalker(world, pos, owner.faction);
        houseCountByFaction.set(owner.faction, (houseCountByFaction.get(owner.faction) ?? 0) + 1);
      }

      // At the cap, population stalls at capacity rather than climbing forever.
      if (population > capacity) population = capacity;

      world.add(entity, House, { level: house.level, population });
    }
  };
}

function countHousesByFaction(world: World): Map<FactionId, number> {
  const counts = new Map<FactionId, number>();
  for (const entity of world.query(House, Owner)) {
    const faction = world.get(entity, Owner)!.faction;
    counts.set(faction, (counts.get(faction) ?? 0) + 1);
  }
  return counts;
}

function spawnWalker(world: World, origin: { x: number; y: number }, faction: FactionId): void {
  const walker = world.createEntity();
  world.add(walker, Position, { x: origin.x, y: origin.y });
  world.add(walker, Owner, { faction });
  world.add(walker, Walker, { strength: 1, state: "seeking", speed: DEFAULT_WALKER_SPEED });
}
