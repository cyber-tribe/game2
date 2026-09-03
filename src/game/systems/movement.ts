import type { System } from "../../ecs";
import { MoveTarget, Position, Walker } from "../components";

/**
 * Moves any Position+MoveTarget+Walker entity toward its target at the
 * walker's speed, clamping so it never overshoots. Clears MoveTarget on
 * arrival so other systems (e.g. settling) can react to it.
 */
export const movementSystem: System = (world, deltaSeconds) => {
  for (const entity of world.query(Position, MoveTarget, Walker)) {
    const pos = world.get(entity, Position)!;
    const target = world.get(entity, MoveTarget)!;
    const walker = world.get(entity, Walker)!;

    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const distance = Math.hypot(dx, dy);
    const step = walker.speed * deltaSeconds;

    if (distance <= step) {
      world.add(entity, Position, { x: target.x, y: target.y });
      world.remove(entity, MoveTarget);
    } else {
      world.add(entity, Position, {
        x: pos.x + (dx / distance) * step,
        y: pos.y + (dy / distance) * step,
      });
    }
  }
};
