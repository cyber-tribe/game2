import type { World } from "../ecs";
import { House, Position, Walker } from "./components";
import { HURRICANE_LENGTH, HURRICANE_PUSH, HURRICANE_WIDTH } from "./constants";
import type { OnImpactEffect } from "./systems/effects";
import type { Point } from "./systems/geometry";

/**
 * The original's ハリケーン (docs/original-miracles.md #20): 「指定方向へ
 * 強風。建物を壊し人を吹き飛ばす。**方向を持つ**」.
 *
 * A one-shot gust along a corridor from `origin`, not a lasting hazard —
 * the miracle that keeps happening after it is cast is 竜巻 (#17), and the
 * two are worth having precisely because one is aimed and instant while
 * the other wanders. Houses inside the corridor are destroyed; walkers are
 * thrown HURRICANE_PUSH tiles further along the wind.
 *
 * **Nothing here kills a walker.** That is the interaction the original
 * names — 「吹き飛ばす先に沼や亀裂を用意して即死地形へ押し込む」 — and it
 * needs no rule of its own: this moves people, and swampSystem,
 * creviceSystem, fungusSystem and drowning.ts each already do what they do
 * to whoever is standing in them on the next tick. A hurricane blown across
 * open ground scatters an army; blown across a swamp it deletes one. The
 * difference is entirely in what the caster prepared, which is the whole
 * point.
 *
 * Returns what it touched so the caller can report a cast that did nothing.
 */
export function applyHurricane(
  world: World,
  origin: Point,
  directionX: number,
  directionY: number,
  onImpact: OnImpactEffect = () => {},
): { blown: number; destroyed: number } {
  const magnitude = Math.hypot(directionX, directionY);
  // A cast with no direction still has to blow somewhere; east, same
  // arbitrary choice applyEarthquake and createTornado make.
  const windX = magnitude === 0 ? 1 : directionX / magnitude;
  const windY = magnitude === 0 ? 0 : directionY / magnitude;

  /** How far along the wind, and how far off its axis, `point` sits. */
  const inCorridor = (point: Point): boolean => {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = dx * windX + dy * windY;
    if (along < 0 || along > HURRICANE_LENGTH) return false;
    // The perpendicular component, via the 2D cross product — same sign
    // convention either side, so the corridor is symmetric about the axis.
    return Math.abs(dx * windY - dy * windX) <= HURRICANE_WIDTH;
  };

  let destroyed = 0;
  for (const entity of world.query(Position, House)) {
    const pos = world.get(entity, Position)!;
    if (!inCorridor(pos)) continue;
    world.destroyEntity(entity);
    onImpact({ position: pos, type: "blown" });
    destroyed++;
  }

  let blown = 0;
  for (const entity of world.query(Position, Walker)) {
    const pos = world.get(entity, Position)!;
    if (!inCorridor(pos)) continue;
    world.add(entity, Position, {
      x: pos.x + windX * HURRICANE_PUSH,
      y: pos.y + windY * HURRICANE_PUSH,
    });
    onImpact({ position: pos, type: "blown" });
    blown++;
  }

  return { blown, destroyed };
}
