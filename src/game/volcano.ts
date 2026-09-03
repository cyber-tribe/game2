import type { World } from "../ecs";
import { House, Position, Walker } from "./components";
import { distance } from "./systems/geometry";

/**
 * The land within `radius` of (x, y) is gone — buried under the new
 * peak — so any house or walker standing there is destroyed along with
 * it. Call this once, alongside `applyVolcano` on the heightmap, when a
 * volcano is cast; it isn't a per-tick system.
 */
export function eruptVolcano(world: World, x: number, y: number, radius: number): void {
  const center = { x, y };

  for (const entity of world.query(Position, House)) {
    if (distance(center, world.get(entity, Position)!) <= radius) {
      world.destroyEntity(entity);
    }
  }

  for (const entity of world.query(Position, Walker)) {
    if (distance(center, world.get(entity, Position)!) <= radius) {
      world.destroyEntity(entity);
    }
  }
}
