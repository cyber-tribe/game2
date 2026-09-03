import type { System } from "../../ecs";
import { DEFAULT_WANDER_RADIUS } from "../constants";
import { MoveTarget, Position, Walker } from "../components";

export interface WanderTargetConfig {
  /** Max distance (in tiles) a new wander target can be from the walker. */
  radius: number;
  /** Injectable RNG, in [0, 1), for deterministic tests. */
  rng: () => number;
}

/**
 * Gives every target-less "seeking" walker a random nearby destination.
 * This stands in for real terrain-aware targeting (finding flat land)
 * until the heightmap is wired into the ECS — see docs/game-system.md.
 */
export function createWanderTargetSystem(config: Partial<WanderTargetConfig> = {}): System {
  const radius = config.radius ?? DEFAULT_WANDER_RADIUS;
  const rng = config.rng ?? Math.random;

  return (world) => {
    for (const entity of world.query(Position, Walker)) {
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;

      const pos = world.get(entity, Position)!;
      const angle = rng() * Math.PI * 2;
      const distance = rng() * radius;

      world.add(entity, MoveTarget, {
        x: pos.x + Math.cos(angle) * distance,
        y: pos.y + Math.sin(angle) * distance,
      });
    }
  };
}
