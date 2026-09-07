import type { System, World } from "../../ecs";
import { isForest, type Heightmap } from "../../world/heightmap";
import {
  DEFAULT_POPULATION_GROWTH_RATE,
  DEFAULT_WALKER_SPEED,
  FOREST_GROWTH_MULTIPLIER,
  HOUSE_LEVELS,
  TERRAIN_GROWTH_MULTIPLIER,
} from "../constants";
import { House, Owner, Position, type FactionId, Walker } from "../components";

export interface HouseGrowthConfig {
  /** Population units accumulated per second, before scaling by house level. */
  growthRate: number;
  /** When given, growthRate is scaled by TERRAIN_GROWTH_MULTIPLIER[heightmap.terrain]. */
  heightmap: Heightmap;
  /**
   * Ceiling on live walkers per faction — MAX_WALKERS_PER_FACTION, a
   * performance guard rather than a game rule. A house at the ceiling
   * keeps accumulating population but stops spawning, and resumes as soon
   * as the faction's walkers thin out (combat, drowning, settling).
   *
   * This replaced a per-faction *house* cap that stood in for land
   * scarcity before settle.ts checked flatness
   * (plan/0118-terrain-based-house-limit.md). The difference matters: a
   * faction that has run out of buildable land now keeps producing
   * walkers, which is how a finished economy turns into an army, whereas
   * the old cap switched production off entirely and — when both sides hit
   * it at once — left a match that could never change again.
   */
  maxWalkersPerFaction: number;
}

export function createHouseGrowthSystem(config: Partial<HouseGrowthConfig> = {}): System {
  const baseGrowthRate = config.growthRate ?? DEFAULT_POPULATION_GROWTH_RATE;
  const maxWalkersPerFaction = config.maxWalkersPerFaction ?? Infinity;
  const growthRate = baseGrowthRate * (config.heightmap ? TERRAIN_GROWTH_MULTIPLIER[config.heightmap.terrain] : 1);

  return (world, deltaSeconds) => {
    const walkerCountByFaction = countWalkersByFaction(world);

    for (const entity of world.query(House, Position, Owner)) {
      const house = world.get(entity, House)!;
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const capacity = HOUSE_LEVELS[house.level].capacity;

      // Woodland around a house speeds its growth — the original's 森
      // (docs/original-miracles.md #6), "信者の成長を促進する効果".
      const woodland = config.heightmap && isForest(config.heightmap, pos.x, pos.y) ? FOREST_GROWTH_MULTIPLIER : 1;
      let population = house.population + growthRate * woodland * deltaSeconds;

      // The old house cap needed a "walkerless faction may spawn anyway"
      // escape valve, because a faction at the cap with nobody left
      // standing could neither gain nor lose a house and so froze forever.
      // A walker ceiling needs no such valve: a faction with zero walkers
      // is as far under it as a faction can get, so it always spawns.
      while (population >= capacity && (walkerCountByFaction.get(owner.faction) ?? 0) < maxWalkersPerFaction) {
        population -= capacity;
        spawnWalker(world, pos, owner.faction);
        walkerCountByFaction.set(owner.faction, (walkerCountByFaction.get(owner.faction) ?? 0) + 1);
      }

      // At the ceiling, population stalls at capacity rather than climbing forever.
      if (population > capacity) population = capacity;

      world.add(entity, House, { level: house.level, population });
    }
  };
}

function countWalkersByFaction(world: World): Map<FactionId, number> {
  const counts = new Map<FactionId, number>();
  for (const entity of world.query(Walker, Owner)) {
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
