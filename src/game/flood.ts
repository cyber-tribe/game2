import type { World } from "../ecs";
import { sampleElevation, type Heightmap } from "../world/heightmap";
import { House, Position, Walker } from "./components";
import type { OnImpactEffect } from "./systems/effects";

/**
 * Sweeps away any house or walker now standing at or below the
 * (just-raised) sea level. Call this once, right after `applyFlood`,
 * when a flood is cast — it isn't a per-tick system. Applies to both
 * factions equally, per docs/game-system.md's "使用側も被害を受けるため
 * 高台の確保が前提". `onImpact`, if given, is called once per house/walker
 * drowned — see systems/effects.ts.
 */
export function drownFlood(world: World, heightmap: Heightmap, onImpact: OnImpactEffect = () => {}): void {
  const isSubmerged = (x: number, y: number) => sampleElevation(heightmap, x, y) <= heightmap.waterLevel;

  for (const entity of world.query(Position, House)) {
    const pos = world.get(entity, Position)!;
    if (isSubmerged(pos.x, pos.y)) {
      world.destroyEntity(entity);
      onImpact({ position: pos, type: "drowned" });
    }
  }

  for (const entity of world.query(Position, Walker)) {
    const pos = world.get(entity, Position)!;
    if (isSubmerged(pos.x, pos.y)) {
      world.destroyEntity(entity);
      onImpact({ position: pos, type: "drowned" });
    }
  }
}
