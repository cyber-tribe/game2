import type { System } from "../../ecs";
import { countFlatNeighbors, type Heightmap } from "../../world/heightmap";
import {
  HOUSE_LEVEL_FLATNESS_REQUIREMENT,
  HOUSE_LEVEL_ORDER,
  HOUSE_UPGRADE_FLATNESS_RADIUS,
} from "../constants";
import { House, Position } from "../components";

export interface HouseUpgradeConfig {
  /** Without a heightmap there's no terrain to measure, so this is a no-op. */
  heightmap: Heightmap;
  flatnessRadius: number;
}

/**
 * Levels a house up (never down) once the land around it is flat enough —
 * see docs/game-system.md and HOUSE_LEVEL_FLATNESS_REQUIREMENT. Capacity,
 * mana output, and defense all scale with the new level automatically via
 * HOUSE_LEVELS, read by the other systems.
 */
export function createHouseUpgradeSystem(config: Partial<HouseUpgradeConfig> = {}): System {
  const heightmap = config.heightmap;
  if (!heightmap) return () => {};
  const radius = config.flatnessRadius ?? HOUSE_UPGRADE_FLATNESS_RADIUS;

  return (world) => {
    for (const entity of world.query(House, Position)) {
      const house = world.get(entity, House)!;
      const pos = world.get(entity, Position)!;
      const flatCount = countFlatNeighbors(heightmap, pos.x, pos.y, radius);

      let bestLevel = house.level;
      for (const level of HOUSE_LEVEL_ORDER) {
        if (flatCount >= HOUSE_LEVEL_FLATNESS_REQUIREMENT[level]) bestLevel = level;
      }

      if (HOUSE_LEVEL_ORDER.indexOf(bestLevel) > HOUSE_LEVEL_ORDER.indexOf(house.level)) {
        world.add(entity, House, { ...house, level: bestLevel });
      }
    }
  };
}
