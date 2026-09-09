import type { Entity, World } from "../ecs";
import type { StalledLava } from "../world/heightmap";
import { LavaFlow } from "./components";

/**
 * Remembers a lava flow that ran out of dry ground before it ran out of
 * lava — 原作「水を埋め立てるとさらに外側へ流れ出す」.
 *
 * Held in the world rather than in the heightmap for the reason
 * game/quake.ts gives: `world/heightmap.ts` knows nothing about the ECS,
 * and plenty of the game erupts volcanoes on maps with no world behind
 * them (tests, the enemy AI's own scratch work).
 *
 * An eruption with nothing left to spend, or one that stopped against no
 * water at all, creates nothing: an entity that will never do anything is
 * still an entity every system walks.
 */
export function createLavaFlow(world: World, stalled: StalledLava | undefined): Entity | undefined {
  if (!stalled) return undefined;
  const entity = world.createEntity();
  world.add(entity, LavaFlow, { blocked: stalled.blocked, remaining: stalled.remaining, hardness: stalled.hardness });
  return entity;
}
