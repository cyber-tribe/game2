import type { System } from "../../ecs";
import { isBuildable, type Heightmap } from "../../world/heightmap";
import { DEFAULT_WANDER_RADIUS } from "../constants";
import { Charmed, MoveTarget, Position, Walker } from "../components";
import { isSettleable } from "./settle";

export interface WanderTargetConfig {
  /** Max distance (in tiles) a new wander target can be from the walker. */
  radius: number;
  /** Injectable RNG, in [0, 1), for deterministic tests. */
  rng: () => number;
  /**
   * When given, targets are re-rolled (up to maxAttempts times) until one
   * lands somewhere worth walking to, and finally clamped to the map's
   * bounds. Without it, targets are unconstrained — used by tests that
   * don't care about terrain.
   */
  heightmap: Heightmap;
  maxAttempts: number;
}

/**
 * Gives every target-less "seeking" walker a random nearby destination,
 * preferring ground it could actually settle on (settle.ts's isSettleable:
 * dry, unspoiled, and flat enough) and falling back to merely buildable
 * ground when a walker's neighbourhood offers nothing better.
 *
 * The preference is what makes land scarcity playable rather than tedious
 * (plan/0118-terrain-based-house-limit.md). Since settle.ts started
 * requiring flat ground, only a minority of a fresh map's vertices qualify
 * — 703 of 4096 measured on 64x64 — so a walker rolling uniformly over dry
 * land would spend most of its life arriving somewhere it cannot build and
 * turning around. Rolling toward flat ground instead means walkers fill
 * the plains first and only mill about once the plains are full, which is
 * also the point at which a faction is supposed to start looking like an
 * army rather than a construction crew.
 *
 * Still a stand-in for real pathfinding: it samples a handful of nearby
 * points rather than searching for the closest flat spot, so a walker in
 * the middle of a wasteland still wanders semi-blindly until it stumbles
 * within DEFAULT_WANDER_RADIUS of somewhere buildable.
 */
export function createWanderTargetSystem(config: Partial<WanderTargetConfig> = {}): System {
  const radius = config.radius ?? DEFAULT_WANDER_RADIUS;
  const rng = config.rng ?? Math.random;
  const heightmap = config.heightmap;
  const maxAttempts = config.maxAttempts ?? 8;

  return (world) => {
    for (const entity of world.query(Position, Walker)) {
      if (world.has(entity, Charmed)) continue;
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;

      const pos = world.get(entity, Position)!;
      let target = randomNearbyPoint(pos, radius, rng);

      if (heightmap) {
        // Keep the best roll seen so far — somewhere settleable if any roll
        // finds one, otherwise somewhere at least buildable — so running out
        // of attempts degrades to the old behaviour instead of to a random
        // point in the sea.
        let fallback = isBuildable(heightmap, target.x, target.y) ? target : undefined;
        for (let attempt = 1; attempt < maxAttempts && !isSettleable(heightmap, target.x, target.y); attempt++) {
          target = randomNearbyPoint(pos, radius, rng);
          if (!fallback && isBuildable(heightmap, target.x, target.y)) fallback = target;
        }
        if (!isSettleable(heightmap, target.x, target.y) && fallback) target = fallback;
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
