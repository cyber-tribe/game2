import type { System } from "../../ecs";
import { isBuildable, type Heightmap } from "../../world/heightmap";
import { DEFAULT_WANDER_RADIUS } from "../constants";
import { MoveTarget, Position, Walker } from "../components";

export interface WanderTargetConfig {
  /** Max distance (in tiles) a new wander target can be from the walker. */
  radius: number;
  /** Injectable RNG, in [0, 1), for deterministic tests. */
  rng: () => number;
  /**
   * When given, targets are re-rolled (up to maxAttempts times) until one
   * lands on buildable land, and finally clamped to the map's bounds.
   * Without it, targets are unconstrained — used by tests that don't care
   * about terrain.
   */
  heightmap: Heightmap;
  maxAttempts: number;
}

/**
 * Gives every target-less "seeking" walker a random nearby destination.
 * This stands in for real "find the nearest flat land" pathing (which
 * would also consider flatness, not just dryness) until that's built —
 * see docs/game-system.md.
 */
export function createWanderTargetSystem(config: Partial<WanderTargetConfig> = {}): System {
  const radius = config.radius ?? DEFAULT_WANDER_RADIUS;
  const rng = config.rng ?? Math.random;
  const heightmap = config.heightmap;
  const maxAttempts = config.maxAttempts ?? 8;

  return (world) => {
    for (const entity of world.query(Position, Walker)) {
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;

      const pos = world.get(entity, Position)!;
      let target = randomNearbyPoint(pos, radius, rng);

      if (heightmap) {
        for (let attempt = 1; attempt < maxAttempts && !isBuildable(heightmap, target.x, target.y); attempt++) {
          target = randomNearbyPoint(pos, radius, rng);
        }
        target = clampToBounds(target, heightmap);
      }

      world.add(entity, MoveTarget, target);
    }
  };
}

function randomNearbyPoint(
  pos: { x: number; y: number },
  radius: number,
  rng: () => number,
): { x: number; y: number } {
  const angle = rng() * Math.PI * 2;
  const distance = rng() * radius;
  return { x: pos.x + Math.cos(angle) * distance, y: pos.y + Math.sin(angle) * distance };
}

function clampToBounds(point: { x: number; y: number }, heightmap: Heightmap): { x: number; y: number } {
  return {
    x: Math.min(Math.max(point.x, 0), heightmap.width),
    y: Math.min(Math.max(point.y, 0), heightmap.height),
  };
}
