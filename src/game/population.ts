import type { World } from "../ecs";
import { House, Owner, Walker, type FactionId } from "./components";

/**
 * A faction's total population across every house it owns (each house's
 * accumulated `population` field) plus every walker it owns (each counts
 * as 1) — see docs/game-system.md's "両陣営の総人口の比較表示". Shared by
 * the HUD's population-comparison display and enemyMiracles.ts's
 * armageddon-timing decision, which both need the exact same number.
 */
export function totalPopulation(world: World, faction: FactionId): number {
  let total = 0;
  for (const entity of world.query(House, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) total += world.get(entity, House)!.population;
  }
  for (const entity of world.query(Walker, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) total += 1;
  }
  return total;
}
