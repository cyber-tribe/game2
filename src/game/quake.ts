import type { Entity, World } from "../ecs";
import { Quake } from "./components";
import { EARTHQUAKE_SHAKE_DURATION, EARTHQUAKE_SHAKE_RADIUS } from "./constants";

/**
 * Marks the ground a fissure just tore as still shaking — 原作「地震が
 * 続いている間は修復が出来ない」.
 *
 * Cast alongside applyEarthquake rather than inside it: applyEarthquake
 * belongs to world/heightmap.ts, which knows nothing about the ECS, and a
 * good deal of the game (tests, the enemy AI's own scratch maps) tears
 * ground without there being a world to shake. Pass it the path
 * applyEarthquake returns.
 *
 * A quake with an empty path — a crack that ran straight off the map edge
 * without tearing anything — is not created at all: there would be nothing
 * for it to hold, and an entity that blocks nothing is still an entity the
 * systems walk every tick.
 */
export function createQuake(
  world: World,
  path: readonly { x: number; y: number }[],
  duration: number = EARTHQUAKE_SHAKE_DURATION,
): Entity | undefined {
  if (path.length === 0) return undefined;
  const entity = world.createEntity();
  world.add(entity, Quake, { remaining: duration, path });
  return entity;
}

/**
 * Whether (x, y) is close enough to a live fissure that the ground there is
 * still moving. Every terrain edit — the player's spade, 平坦化, 自動整地,
 * and the enemy AI's own levelling — checks this first.
 *
 * Deliberately not a check the *miracles* make: 花 fills a crevice back in
 * and goes on doing so during the shaking. The original's line is about
 * 修復 — the spade — and a miracle that could be countered by another
 * miracle is still a miracle worth casting. Denying the cheap manual fix is
 * the whole of the difference.
 */
export function isGroundShaking(world: World, x: number, y: number, radius: number = EARTHQUAKE_SHAKE_RADIUS): boolean {
  for (const entity of world.query(Quake)) {
    for (const point of world.get(entity, Quake)!.path) {
      if (Math.hypot(point.x - x, point.y - y) <= radius) return true;
    }
  }
  return false;
}
