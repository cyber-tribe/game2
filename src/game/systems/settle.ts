import type { System } from "../../ecs";
import { House, MoveTarget, Owner, Position, Walker } from "../components";

/**
 * A "seeking" walker that has arrived at its target (no MoveTarget left)
 * settles: it builds a hut where it stands and stops existing as a walker.
 */
export const settleSystem: System = (world) => {
  for (const entity of world.query(Position, Walker, Owner)) {
    const walker = world.get(entity, Walker)!;
    if (walker.state !== "seeking") continue;
    if (world.has(entity, MoveTarget)) continue;

    const pos = world.get(entity, Position)!;
    const owner = world.get(entity, Owner)!;

    const house = world.createEntity();
    world.add(house, Position, { x: pos.x, y: pos.y });
    world.add(house, Owner, { faction: owner.faction });
    world.add(house, House, { level: "hut", population: 0 });

    world.destroyEntity(entity);
  }
};
