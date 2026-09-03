import type { System } from "../../ecs";
import { Position, Swamp, Walker } from "../components";
import { distance } from "./geometry";

/**
 * Any walker within a swamp's radius drowns — per docs/game-system.md,
 * "踏み込んだ通常の民は沈んで死ぬ". Each drowning consumes one unit of
 * the swamp's remainingCapacity; once it hits zero the swamp itself
 * dries up and is removed.
 */
export const swampSystem: System = (world) => {
  for (const swampEntity of world.query(Swamp, Position)) {
    const swampPos = world.get(swampEntity, Position)!;

    for (const walkerEntity of world.query(Walker, Position)) {
      if (!world.isAlive(swampEntity)) break;

      const walkerPos = world.get(walkerEntity, Position)!;
      const swamp = world.get(swampEntity, Swamp)!;
      if (distance(swampPos, walkerPos) > swamp.radius) continue;

      world.destroyEntity(walkerEntity);

      const remainingCapacity = swamp.remainingCapacity - 1;
      if (remainingCapacity <= 0) {
        world.destroyEntity(swampEntity);
      } else {
        world.add(swampEntity, Swamp, { ...swamp, remainingCapacity });
      }
    }
  }
};
