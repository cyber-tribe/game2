import type { System, World } from "../../ecs";
import { DEFAULT_POPULATION_GROWTH_RATE, DEFAULT_WALKER_SPEED, HOUSE_LEVELS } from "../constants";
import { House, Owner, Position, type FactionId, Walker } from "../components";

export interface HouseGrowthConfig {
  /** Population units accumulated per second, before scaling by house level. */
  growthRate: number;
}

/**
 * Accumulates population in every house; each time it fills the house's
 * capacity, a new "seeking" walker is spawned at the house and the excess
 * carries over. House level (and therefore capacity) does not change here —
 * per docs/game-system.md that depends on surrounding terrain flatness,
 * which isn't wired into the ECS yet.
 */
export function createHouseGrowthSystem(config: Partial<HouseGrowthConfig> = {}): System {
  const growthRate = config.growthRate ?? DEFAULT_POPULATION_GROWTH_RATE;

  return (world, deltaSeconds) => {
    for (const entity of world.query(House, Position, Owner)) {
      const house = world.get(entity, House)!;
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const capacity = HOUSE_LEVELS[house.level].capacity;

      let population = house.population + growthRate * deltaSeconds;

      while (population >= capacity) {
        population -= capacity;
        spawnWalker(world, pos, owner.faction);
      }

      world.add(entity, House, { level: house.level, population });
    }
  };
}

function spawnWalker(world: World, origin: { x: number; y: number }, faction: FactionId): void {
  const walker = world.createEntity();
  world.add(walker, Position, { x: origin.x, y: origin.y });
  world.add(walker, Owner, { faction });
  world.add(walker, Walker, { strength: 1, state: "seeking", speed: DEFAULT_WALKER_SPEED });
}
