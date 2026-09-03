import type { System } from "../../ecs";
import { isBuildable, type Heightmap } from "../../world/heightmap";
import { House, MoveTarget, Owner, Position, Walker } from "../components";

export interface SettleConfig {
  /** When given, a walker only settles on buildable (above sea level) land. */
  heightmap: Heightmap;
}

/**
 * A "seeking" walker that has arrived at its target (no MoveTarget left)
 * settles: it builds a hut where it stands and stops existing as a walker.
 * If a heightmap says the spot isn't buildable, it's left as-is — with no
 * MoveTarget, createWanderTargetSystem will hand it a fresh destination
 * next tick.
 */
export function createSettleSystem(config: Partial<SettleConfig> = {}): System {
  const heightmap = config.heightmap;

  return (world) => {
    for (const entity of world.query(Position, Walker, Owner)) {
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;

      const pos = world.get(entity, Position)!;
      if (heightmap && !isBuildable(heightmap, pos.x, pos.y)) continue;

      const owner = world.get(entity, Owner)!;
      const house = world.createEntity();
      world.add(house, Position, { x: pos.x, y: pos.y });
      world.add(house, Owner, { faction: owner.faction });
      world.add(house, House, { level: "hut", population: 0 });

      world.destroyEntity(entity);
    }
  };
}
