import type { Entity, World } from "../ecs";
import { Position, Storm } from "./components";
import { STORM_LIFETIME, STORM_STRIKE_INTERVAL } from "./constants";

/**
 * The 嵐 miracle: a thundercloud parked over (x, y) — see the Storm
 * component and systems/storm.ts.
 *
 * Unlike the 竜巻 and the 火柱 it takes no heading, because it does not go
 * anywhere. The decision a player makes about a storm is entirely *where*,
 * which is what makes it the area-denial miracle rather than another
 * wandering hazard.
 */
export function createStorm(world: World, x: number, y: number, lifetime: number = STORM_LIFETIME): Entity {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Storm, { remaining: lifetime, untilStrike: STORM_STRIKE_INTERVAL });
  return entity;
}
