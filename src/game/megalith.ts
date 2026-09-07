import type { World } from "../ecs";
import { House, Position } from "./components";

/**
 * Destroys every house standing on ground a 地下巨石 came up through —
 * and nothing else. Call it once alongside `applyMegalith` on the
 * heightmap, passing the vertices that returned; it isn't a per-tick
 * system.
 *
 * **Houses only, walkers never.** The original calls this an obstacle to
 * building (docs/original-miracles.md #14's 「大規模建築の障害になり」),
 * not a weapon, and this game already has a miracle that buries whoever is
 * standing there (see volcano.ts). A building cannot survive its own
 * foundation turning into a boulder; the people standing on that ground
 * ride it up. Keeping it that way is what stops 地下巨石 from being a
 * cheaper 火山 — what it takes from a faction is room to grow, not lives.
 *
 * Positions are matched by their nearest vertex, the same rounding
 * isBoulder uses, so "this position reads as stone" and "this house was
 * destroyed" cannot disagree.
 */
export function raiseMegalith(world: World, raised: readonly { x: number; y: number }[]): number {
  const covered = new Set(raised.map(({ x, y }) => `${x},${y}`));
  let destroyed = 0;

  for (const entity of world.query(Position, House)) {
    const position = world.get(entity, Position)!;
    if (!covered.has(`${Math.round(position.x)},${Math.round(position.y)}`)) continue;
    world.destroyEntity(entity);
    destroyed++;
  }

  return destroyed;
}
