import type { Entity, World } from "../ecs";
import { Position, Swamp } from "./components";
import { SWAMP_CAPACITY, SWAMP_RADIUS } from "./constants";

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
