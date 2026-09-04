import type { System } from "../../ecs";
import { KnightCooldown, MoveTarget, Owner, Position, Walker } from "../components";
import { findNearestEnemyPosition } from "./fightTargeting";

/**
 * A knight always seeks out the nearest enemy walker or house, regardless
 * of its faction's behaviorMode — per docs/game-system.md, "指示に
 * 依存せず戦い続ける". Unlike fightTargetingSystem (which only acts on
 * "seeking" walkers under "fight" mode), this targets every "knight"-state
 * walker unconditionally.
 *
 * Skips a knight currently under KnightCooldown (see its doc comment):
 * without a pause after each burn, a knight instantly retargets and
 * marches the moment it arrives, so one knight could level a whole
 * undefended settlement in seconds — collapsing a match's
 * "小競り合い→復興/逆転" phases into a single instant.
 */
export const knightTargetingSystem: System = (world) => {
  for (const entity of world.query(Position, Walker, Owner)) {
    const walker = world.get(entity, Walker)!;
    if (walker.state !== "knight") continue;
    if (world.has(entity, MoveTarget)) continue;
    if (world.has(entity, KnightCooldown)) continue;

    const owner = world.get(entity, Owner)!;
    const target = findNearestEnemyPosition(world, owner.faction, world.get(entity, Position)!);
    if (target) world.add(entity, MoveTarget, target);
  }
};

/** Counts down KnightCooldown, removing it once a knight's rest is over. */
export const knightCooldownSystem: System = (world, deltaSeconds) => {
  for (const entity of world.query(KnightCooldown)) {
    const remaining = world.get(entity, KnightCooldown)!.remaining - deltaSeconds;
    if (remaining <= 0) {
      world.remove(entity, KnightCooldown);
    } else {
      world.add(entity, KnightCooldown, { remaining });
    }
  }
};
