import type { Entity, World } from "../ecs";
import { Position, Tornado, Whirlpool } from "./components";
import {
  TORNADO_LIFETIME,
  TORNADO_WHIRLPOOL_INTERVAL,
  WHIRLPOOL_LIFETIME,
  WHIRLPOOL_MAX_SPLITS,
  WHIRLPOOL_SPLIT_INTERVAL,
} from "./constants";

/**
 * The 竜巻 miracle: a wandering hazard dropped at (x, y) — see the Tornado
 * component and systems/tornado.ts.
 *
 * The initial heading is the caller's to choose (main.ts aims it away from
 * the caster's own shrine, the same way an earthquake's fissure is aimed),
 * but nothing keeps it: a tornado wanders, and where it ends up is the
 * miracle's whole character.
 */
export function createTornado(
  world: World,
  x: number,
  y: number,
  headingX: number,
  headingY: number,
  lifetime: number = TORNADO_LIFETIME,
): Entity {
  const magnitude = Math.hypot(headingX, headingY);
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Tornado, {
    remaining: lifetime,
    // A cast with no direction at all still has to drift somewhere; east
    // is as arbitrary as anything else, same as applyEarthquake's choice.
    headingX: magnitude === 0 ? 1 : headingX / magnitude,
    headingY: magnitude === 0 ? 0 : headingY / magnitude,
    // Ready to spawn the moment it reaches water, so a tornado cast
    // straight out to sea does not waste its first interval doing nothing.
    sinceWhirlpool: TORNADO_WHIRLPOOL_INTERVAL,
  });
  return entity;
}

/**
 * Spawns a 渦巻き — only ever called when a tornado reaches water (see
 * systems/tornado.ts) or when an existing whirlpool splits (see
 * systems/whirlpool.ts). There is deliberately no 渦巻き miracle: casting
 * one directly would throw away 竜巻 → 渦巻き, which is the reason the
 * original has both.
 */
export function createWhirlpool(
  world: World,
  x: number,
  y: number,
  headingX: number,
  headingY: number,
  splitsLeft: number = WHIRLPOOL_MAX_SPLITS,
  remaining: number = WHIRLPOOL_LIFETIME,
): Entity {
  const magnitude = Math.hypot(headingX, headingY);
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Whirlpool, {
    remaining,
    untilSplit: WHIRLPOOL_SPLIT_INTERVAL,
    splitsLeft,
    headingX: magnitude === 0 ? 1 : headingX / magnitude,
    headingY: magnitude === 0 ? 0 : headingY / magnitude,
  });
  return entity;
}
