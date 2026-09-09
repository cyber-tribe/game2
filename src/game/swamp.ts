import type { Entity, World } from "../ecs";
import { Position, Swamp } from "./components";
import { SWAMP_CAPACITY, SWAMP_RADIUS } from "./constants";
import { distance } from "./systems/geometry";

/**
 * Conjures a swamp at (x, y) — see the Swamp component and swampSystem.
 *
 * `bottomless` is the per-world 底なし setting
 * (docs/original-miracles.md #8: 「面ごとに底なしかどうか設定される」), so
 * both call sites — the player's own cast in main.ts and the enemy god's
 * in enemyMiracles.ts — pass their world's value and neither side gets a
 * different kind of swamp from the other. Defaults to the draining kind,
 * which is what game2 had before the permanent variant existed.
 */
export function createSwamp(
  world: World,
  x: number,
  y: number,
  radius: number = SWAMP_RADIUS,
  capacity: number = SWAMP_CAPACITY,
  bottomless = false,
): Entity {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Swamp, { radius, remainingCapacity: capacity, bottomless });
  return entity;
}

/**
 * The "地震" miracle's counter to 沼: churning up the ground within
 * `radius` of (x, y) — applyEarthquake's own footprint — drains any
 * swamp whose danger zone overlaps it, destroying the Swamp entity
 * outright (no more drownings, remainingCapacity irrelevant). Call this
 * alongside applyEarthquake, wherever it's invoked, so an earthquake cast
 * on top of an enemy's (or one's own) swamp reliably removes it instead
 * of just rearranging the terrain underneath it.
 */
export function collapseSwampsNear(world: World, x: number, y: number, radius: number): number {
  let collapsed = 0;
  for (const entity of world.query(Position, Swamp)) {
    const pos = world.get(entity, Position)!;
    const swamp = world.get(entity, Swamp)!;
    if (distance(pos, { x, y }) <= radius + swamp.radius) {
      world.destroyEntity(entity);
      collapsed++;
    }
  }
  return collapsed;
}
