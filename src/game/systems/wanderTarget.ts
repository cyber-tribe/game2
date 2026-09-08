import type { System } from "../../ecs";
import { isBuildable, type Heightmap } from "../../world/heightmap";
import { DEFAULT_WANDER_RADIUS, WANDER_OUTWARD_BIAS } from "../constants";
import { Charmed, MoveTarget, Position, Walker } from "../components";

export interface WanderTargetConfig {
  /** Max distance (in tiles) a new wander target can be from the walker. */
  radius: number;
  /** Injectable RNG, in [0, 1), for deterministic tests. */
  rng: () => number;
  /**
   * When given, targets are re-rolled (up to maxAttempts times) until one
   * lands on buildable land, and finally clamped to the map's bounds. It is
   * also what tells a walker where the middle of the map is, so the outward
   * lean below only applies when a heightmap is supplied.
   * Without it, targets are unconstrained — used by tests that don't care
   * about terrain.
   */
  heightmap: Heightmap;
  maxAttempts: number;
  /** See WANDER_OUTWARD_BIAS. 0 restores the old isotropic wander. */
  outwardBias: number;
}

/**
 * Gives every target-less "seeking" walker a random nearby destination.
 * This stands in for real "find the nearest flat land" pathing (which
 * would also consider flatness, not just dryness) until that's built —
 * see docs/game-system.md.
 *
 * The walk is not isotropic: 原作 says of 定住 that 「マップ中央よりは端に
 * 向かいやすい傾向があります」, so each roll is nudged away from the map's
 * centre by WANDER_OUTWARD_BIAS. That is what spreads a settlement outward
 * across its landmass instead of letting it pile up around the spot the
 * first walkers happened to land on.
 */
export function createWanderTargetSystem(config: Partial<WanderTargetConfig> = {}): System {
  const radius = config.radius ?? DEFAULT_WANDER_RADIUS;
  const rng = config.rng ?? Math.random;
  const heightmap = config.heightmap;
  const maxAttempts = config.maxAttempts ?? 8;
  const outwardBias = config.outwardBias ?? WANDER_OUTWARD_BIAS;

  return (world) => {
    for (const entity of world.query(Position, Walker)) {
      if (world.has(entity, Charmed)) continue;
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;

      const pos = world.get(entity, Position)!;
      const outward = heightmap ? outwardDirection(pos, heightmap) : undefined;
      let target = randomNearbyPoint(pos, radius, rng, outward, outwardBias);

      if (heightmap) {
        for (let attempt = 1; attempt < maxAttempts && !isBuildable(heightmap, target.x, target.y); attempt++) {
          target = randomNearbyPoint(pos, radius, rng, outward, outwardBias);
        }
        target = clampToBounds(target, heightmap);
      }

      world.add(entity, MoveTarget, target);
    }
  };
}

/**
 * The unit vector pointing from the middle of the map to `pos`, or
 * undefined for a walker standing exactly on the centre — which has no
 * outward direction to lean towards, and so keeps the plain uniform roll.
 */
function outwardDirection(
  pos: { x: number; y: number },
  heightmap: Heightmap,
): { x: number; y: number } | undefined {
  const dx = pos.x - heightmap.width / 2;
  const dy = pos.y - heightmap.height / 2;
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : undefined;
}

function randomNearbyPoint(
  pos: { x: number; y: number },
  radius: number,
  rng: () => number,
  outward: { x: number; y: number } | undefined,
  outwardBias: number,
): { x: number; y: number } {
  const angle = rng() * Math.PI * 2;
  const distance = rng() * radius;
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);

  if (outward && outwardBias > 0) {
    dx = dx * (1 - outwardBias) + outward.x * outwardBias;
    dy = dy * (1 - outwardBias) + outward.y * outwardBias;
    const length = Math.hypot(dx, dy);
    // Renormalise so the bias only turns the walker, never shortens its
    // step. The two terms cancel exactly when the roll points dead inward
    // and the bias is 1/2; there the outward direction is all that's left.
    if (length > 0) {
      dx /= length;
      dy /= length;
    } else {
      dx = outward.x;
      dy = outward.y;
    }
  }

  return { x: pos.x + dx * distance, y: pos.y + dy * distance };
}

function clampToBounds(point: { x: number; y: number }, heightmap: Heightmap): { x: number; y: number } {
  return {
    x: Math.min(Math.max(point.x, 0), heightmap.width),
    y: Math.min(Math.max(point.y, 0), heightmap.height),
  };
}
