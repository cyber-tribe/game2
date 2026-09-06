import type { Entity, World } from "../ecs";
import { HolyWater, Owner, Position, type FactionId } from "./components";
import { HOLY_WATER_CAPACITY, HOLY_WATER_RADIUS } from "./constants";

/**
 * Conjures a 聖水の泉 at (x, y) belonging to `faction` — see the HolyWater
 * component and holyWaterSystem.
 *
 * The owner is the side walkers come *out* as, not the side that suffers,
 * which is what makes this a miracle worth casting on the enemy's doorstep
 * rather than on your own.
 */
export function createHolyWater(
  world: World,
  faction: FactionId,
  x: number,
  y: number,
  radius: number = HOLY_WATER_RADIUS,
  capacity: number = HOLY_WATER_CAPACITY,
): Entity {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, HolyWater, { radius, remainingCapacity: capacity });
  return entity;
}
