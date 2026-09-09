import type { World } from "../ecs";
import { sampleElevation, type Heightmap } from "../world/heightmap";
import { Drowning, MoveTarget, Owner, Position, Walker, type FactionId } from "./components";
import { RESCUE_RADIUS, RESCUE_SHORE_SEARCH } from "./constants";
import { distance } from "./systems/geometry";

/**
 * The original's 「溺れた人間の救出」 — one of the ten per-stage ○× settings
 * (docs/original-maps.md), and the only one of them that is an *operation*
 * rather than a restriction.
 *
 * Pulls the nearest of the caster's own drowning followers out of the water
 * and puts it on the nearest dry ground. Nothing else about it is special:
 * the walker keeps its strength and simply goes back to walking, because
 * drowning in game2 is already a countdown that a walker fully recovers
 * from on reaching land (see systems/drowning.ts) — a rescue is the player
 * doing by hand what the walker was failing to do by itself.
 *
 * Free, like スプログ. The ○× table is a list of *operations* a stage
 * grants or withholds, not of miracles, and charging mana for it would
 * make the setting meaningless on any stage where mana is tight — which is
 * every stage where anyone is drowning.
 *
 * Only the caster's own people: fishing an enemy walker out of the sea is
 * not a courtesy the original offers, and 集結/魅了 already exist for
 * taking someone else's followers.
 *
 * Returns the rescued entity, or undefined when nobody within reach was
 * drowning (the caller reports that rather than silently doing nothing).
 */
export function rescueDrowning(
  world: World,
  heightmap: Heightmap,
  faction: FactionId,
  at: { x: number; y: number },
  radius: number = RESCUE_RADIUS,
): number | undefined {
  let best: { entity: number; distance: number } | undefined;

  for (const entity of world.query(Walker, Position, Drowning)) {
    if (world.get(entity, Owner)?.faction !== faction) continue;
    const pos = world.get(entity, Position)!;
    const reach = distance(at, pos);
    if (reach > radius) continue;
    if (!best || reach < best.distance) best = { entity, distance: reach };
  }

  if (!best) return undefined;

  const drowningPos = world.get(best.entity, Position)!;
  const shore = nearestDryGround(heightmap, drowningPos);
  if (!shore) return undefined;

  world.add(best.entity, Position, shore);
  world.remove(best.entity, Drowning);
  // Its old destination was somewhere out in the water it just came from;
  // dropping it lets wanderTarget hand out a fresh one from the shore.
  if (world.has(best.entity, MoveTarget)) world.remove(best.entity, MoveTarget);
  return best.entity;
}

/**
 * The closest vertex above the waterline, searched outward in rings.
 *
 * Dry ground rather than *buildable* ground: someone hauled out of the sea
 * has to stand somewhere, and refusing to put them down on scorched earth
 * or volcano rock would mean a rescue that fails next to a shore the
 * player can plainly see. Where they settle afterwards is settle.ts's
 * problem, and it already knows the difference.
 *
 * Undefined when there is no land within RESCUE_SHORE_SEARCH — a walker
 * adrift in the middle of an ocean is genuinely beyond reach, and moving
 * it halfway across the map would be a teleport rather than a rescue.
 */
function nearestDryGround(
  heightmap: Heightmap,
  from: { x: number; y: number },
): { x: number; y: number } | undefined {
  const cx = Math.round(from.x);
  const cy = Math.round(from.y);

  for (let ring = 0; ring <= RESCUE_SHORE_SEARCH; ring++) {
    let best: { x: number; y: number; distance: number } | undefined;

    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        // The ring's edge only — inner vertices were covered by an earlier,
        // strictly closer pass.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) continue;
        if (sampleElevation(heightmap, x, y) <= heightmap.waterLevel) continue;
        const reach = Math.hypot(x - from.x, y - from.y);
        if (!best || reach < best.distance) best = { x, y, distance: reach };
      }
    }

    if (best) return { x: best.x, y: best.y };
  }

  return undefined;
}
