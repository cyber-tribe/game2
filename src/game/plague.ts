import type { World } from "../ecs";
import { House, Infected, Position, Walker } from "./components";
import { PLAGUE_DURATION, PLAGUE_RADIUS } from "./constants";
import { distance, type Point } from "./systems/geometry";

/**
 * The 病原菌 miracle: infects every walker and house around `at` — see the
 * Infected component and systems/plague.ts for what being infected costs.
 *
 * It does not care whose they are. A disease that checked banners would
 * not be a disease, and the risk that it comes back around is the reason
 * casting it near your own people is a decision rather than a free debuff.
 *
 * Returns how many it took, so a cast that finds nobody can be refused
 * rather than silently charged for.
 */
export function seedPlague(world: World, at: Point, radius: number = PLAGUE_RADIUS): number {
  let infected = 0;

  for (const entity of [...world.query(Walker, Position), ...world.query(House, Position)]) {
    if (world.has(entity, Infected)) continue;
    if (distance(at, world.get(entity, Position)!) > radius) continue;
    world.add(entity, Infected, { remaining: PLAGUE_DURATION });
    infected++;
  }

  return infected;
}
