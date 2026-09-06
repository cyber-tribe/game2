import type { System } from "../../ecs";
import { isRoad, type Heightmap } from "../../world/heightmap";
import { ROAD_SPEED_MULTIPLIER } from "../constants";
import { MoveTarget, Position, Walker } from "../components";

export interface MovementConfig {
  /**
   * The world's terrain, needed only to tell whether a walker is on a road
   * (see ROAD_SPEED_MULTIPLIER). Optional: without one, everyone simply
   * walks at their own speed everywhere, which is what every test that
   * doesn't care about roads expects.
   */
  heightmap: Heightmap;
}

/**
 * Moves any Position+MoveTarget+Walker entity toward its target at the
 * walker's speed, clamping so it never overshoots. Clears MoveTarget on
 * arrival so other systems (e.g. settling) can react to it.
 *
 * A walker standing on a road moves ROAD_SPEED_MULTIPLIER times faster —
 * the original's 道, "上では信者の移動速度が上がる"
 * (docs/original-miracles.md #11). Sampled at the walker's current
 * position rather than along the path: stepping onto the pavement speeds
 * you up from that tick on, stepping off slows you down again, so a road
 * is worth following even when it isn't the straight line.
 */
export function createMovementSystem(config: Partial<MovementConfig> = {}): System {
  const heightmap = config.heightmap;

  return (world, deltaSeconds) => {
    for (const entity of world.query(Position, MoveTarget, Walker)) {
      const pos = world.get(entity, Position)!;
      const target = world.get(entity, MoveTarget)!;
      const walker = world.get(entity, Walker)!;

      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const distance = Math.hypot(dx, dy);
      const onRoad = heightmap !== undefined && isRoad(heightmap, pos.x, pos.y);
      const step = walker.speed * (onRoad ? ROAD_SPEED_MULTIPLIER : 1) * deltaSeconds;

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
}

/** The road-unaware movement system — see createMovementSystem. */
export const movementSystem: System = createMovementSystem();
