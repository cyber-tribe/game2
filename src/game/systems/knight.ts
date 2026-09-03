import type { System } from "../../ecs";
import { MoveTarget, Owner, Position, Walker } from "../components";
import { findNearestEnemyPosition } from "./fightTargeting";

/**
 * A knight always seeks out the nearest enemy walker or house, regardless
 * of its faction's behaviorMode — per docs/game-system.md, "指示に
 * 依存せず戦い続ける". Unlike fightTargetingSystem (which only acts on
 * "seeking" walkers under "fight" mode), this targets every "knight"-state
 * walker unconditionally.
 */
export const knightTargetingSystem: System = (world) => {
  for (const entity of world.query(Position, Walker, Owner)) {
    const walker = world.get(entity, Walker)!;
    if (walker.state !== "knight") continue;
    if (world.has(entity, MoveTarget)) continue;

    const owner = world.get(entity, Owner)!;
    const target = findNearestEnemyPosition(world, owner.faction, world.get(entity, Position)!);
    if (target) world.add(entity, MoveTarget, target);
  }
};
