import type { Entity, World } from "../ecs";
import { Position, Swamp } from "./components";
import { SWAMP_CAPACITY, SWAMP_RADIUS } from "./constants";
import { distance } from "./systems/geometry";

/** Conjures a swamp at (x, y) — see the Swamp component and swampSystem. */
export function createSwamp(
  world: World,
  x: number,
  y: number,
  radius: number = SWAMP_RADIUS,
  capacity: number = SWAMP_CAPACITY,
): Entity {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Swamp, { radius, remainingCapacity: capacity });
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
export function collapseSwampsNear(world: World, x: number, y: number, radius: number): void {
  for (const entity of world.query(Position, Swamp)) {
    const pos = world.get(entity, Position)!;
    const swamp = world.get(entity, Swamp)!;
    if (distance(pos, { x, y }) <= radius + swamp.radius) {
      world.destroyEntity(entity);
    }
  }
}
