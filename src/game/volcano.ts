import type { World } from "../ecs";
import { House, Position, Walker } from "./components";

/**
 * The land within `radius` of (x, y) is gone — buried under the new
 * peak — so any house or walker standing there is destroyed along with
 * it. Call this once, alongside `applyVolcano` on the heightmap, when a
 * volcano is cast; it isn't a per-tick system.
 *
 * Uses the same square footprint as applyVolcano's vertex loop (Chebyshev
 * distance on the *rounded* vertex each position sits on, not a Euclidean
 * distance on raw coordinates) — matching how heightmap.ts's `isRock`
 * itself samples rockHardness by rounding to the nearest vertex. A
 * circular or unrounded check could mark a position's nearest vertex as
 * rock (via applyVolcano) without this function agreeing that the entity
 * standing there was destroyed, leaving a settled house on unbuildable
 * land.
 */
export function eruptVolcano(world: World, x: number, y: number, radius: number): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const withinFootprint = (position: { x: number; y: number }) =>
    Math.abs(Math.round(position.x) - cx) <= radius && Math.abs(Math.round(position.y) - cy) <= radius;

  for (const entity of world.query(Position, House)) {
    if (withinFootprint(world.get(entity, Position)!)) {
      world.destroyEntity(entity);
    }
  }

  for (const entity of world.query(Position, Walker)) {
    if (withinFootprint(world.get(entity, Position)!)) {
      world.destroyEntity(entity);
    }
  }
}
