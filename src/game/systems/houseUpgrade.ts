import type { System } from "../../ecs";
import { countFlatNeighbors, type Heightmap } from "../../world/heightmap";
import {
  HOUSE_LEVEL_FLATNESS_REQUIREMENT,
  HOUSE_LEVEL_ORDER,
  HOUSE_UPGRADE_FLATNESS_RADIUS,
} from "../constants";
import { House, Owner, Position, type FactionId } from "../components";

export interface HouseUpgradeConfig {
  /** Without a heightmap there's no terrain to measure, so this is a no-op. */
  heightmap: Heightmap;
  flatnessRadius: number;
  /**
   * Called when a house reaches "castle", the top level — not on every
   * intermediate upgrade, which would be too routine to be worth telling
   * a story about (see Simulation's MatchEvent log).
   */
  onReachCastle: (faction: FactionId) => void;
}

/**
 * Keeps a house's level matched to how flat the land around it currently
 * is — see docs/game-system.md and HOUSE_LEVEL_FLATNESS_REQUIREMENT.
 * Moves in both directions: flattening more land upgrades it, and
 * roughing up its surroundings (e.g. an earthquake) can downgrade it.
 * Capacity, mana output, and defense all scale with the new level
 * automatically via HOUSE_LEVELS, read by the other systems.
 */
export function createHouseUpgradeSystem(config: Partial<HouseUpgradeConfig> = {}): System {
  const heightmap = config.heightmap;
  if (!heightmap) return () => {};
  const radius = config.flatnessRadius ?? HOUSE_UPGRADE_FLATNESS_RADIUS;
  const onReachCastle = config.onReachCastle ?? (() => {});
  const topLevel = HOUSE_LEVEL_ORDER[HOUSE_LEVEL_ORDER.length - 1];

  return (world) => {
    for (const entity of world.query(House, Position)) {
      const house = world.get(entity, House)!;
      const pos = world.get(entity, Position)!;
      const flatCount = countFlatNeighbors(heightmap, pos.x, pos.y, radius);

      let level = HOUSE_LEVEL_ORDER[0];
      for (const candidate of HOUSE_LEVEL_ORDER) {
        if (flatCount >= HOUSE_LEVEL_FLATNESS_REQUIREMENT[candidate]) level = candidate;
      }

      if (level !== house.level) {
        world.add(entity, House, { ...house, level });
        if (level === topLevel && house.level !== topLevel && world.has(entity, Owner)) {
          onReachCastle(world.get(entity, Owner)!.faction);
        }
      }
    }
  };
}
