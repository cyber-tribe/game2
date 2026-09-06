import type { Entity, System, World } from "../../ecs";
import { Charmed, MoveTarget, Owner, Position, Walker } from "../components";
import { HELEN_CHARM_CAPACITY, HELEN_CHARM_RADIUS, HELEN_FOLLOW_DISTANCE } from "../constants";
import { distance, type Point } from "./geometry";

/**
 * Everything トロイのヘレン does (docs/original-miracles.md #28):
 * 「敵と戦わない。敵信者を魅了・拘束して建物から引き離し連れ回す。ヘレンが
 * 死ぬと拘束は解ける。敵の人口・建築基盤を崩す」.
 *
 * Three jobs, in the order they have to happen:
 *
 * 1. **Release** anyone whose Helen is gone. Hers is the only effect in the
 *    game that is undone by its own caster dying, and doing it first means
 *    a walker freed this tick is available to be charmed by a *different*
 *    Helen in the same pass rather than sitting idle for one.
 * 2. **Charm** enemy walkers within HELEN_CHARM_RADIUS, up to
 *    HELEN_CHARM_CAPACITY at a time.
 * 3. **Drag** everyone she holds along behind her, and walk her toward the
 *    nearest enemy walker she has not taken yet.
 *
 * She never targets houses, unlike every other attacking hero: she has no
 * way to hurt one, and the point of her is the people who would otherwise
 * be living in them.
 */
export function createHelenSystem(): System {
  return (world) => {
    releaseAbandoned(world);

    for (const helen of world.query(Walker, Position, Owner)) {
      if (world.get(helen, Walker)!.state !== "helen") continue;

      const helenPos = world.get(helen, Position)!;
      const faction = world.get(helen, Owner)!.faction;
      const held = world.query(Charmed).filter((entity) => world.get(entity, Charmed)!.by === helen);

      for (const entity of world.query(Walker, Position, Owner)) {
        if (held.length >= HELEN_CHARM_CAPACITY) break;
        if (world.get(entity, Owner)!.faction === faction) continue;
        if (world.has(entity, Charmed)) continue;
        if (distance(helenPos, world.get(entity, Position)!) > HELEN_CHARM_RADIUS) continue;

        world.add(entity, Charmed, { by: helen });
        held.push(entity);
      }

      // The held trail her rather than standing where they were taken —
      // 「建物から引き離し連れ回す」. Being walked away from their own
      // settlement is the entire effect; charming someone who then stayed
      // put next to their house would cost their side nothing.
      for (const entity of held) {
        if (!world.isAlive(entity)) continue;
        world.add(entity, MoveTarget, followPoint(helenPos, world.get(entity, Position)!));
      }

      if (world.has(helen, MoveTarget)) continue;
      const prey = nearestUncharmedEnemy(world, faction, helenPos);
      if (prey) world.add(helen, MoveTarget, prey);
    }
  };
}

/**
 * Frees anyone whose Helen is no longer a live Helen — 「ヘレンが死ぬと拘束
 * は解ける」.
 *
 * The check is "still a live walker in the helen state", not merely "the
 * entity id is alive": World hands freed ids straight back out, so a dead
 * Helen's id can belong to something else entirely a tick later, and her
 * prisoners would then follow a house or a swamp around forever.
 */
function releaseAbandoned(world: World): void {
  for (const entity of world.query(Charmed)) {
    const by = world.get(entity, Charmed)!.by;
    const stillHers = world.isAlive(by) && world.has(by, Walker) && world.get(by, Walker)!.state === "helen";
    if (stillHers) continue;

    world.remove(entity, Charmed);
    // Their old orders were Helen's, not their own; dropping the target
    // hands them straight back to their own faction's systems.
    if (world.has(entity, MoveTarget)) world.remove(entity, MoveTarget);
  }
}

/** A point HELEN_FOLLOW_DISTANCE short of Helen, so the held bunch around her instead of stacking on her exact tile. */
function followPoint(helenPos: Point, from: Point): Point {
  const dx = helenPos.x - from.x;
  const dy = helenPos.y - from.y;
  const away = Math.hypot(dx, dy);
  if (away <= HELEN_FOLLOW_DISTANCE) return { x: from.x, y: from.y };
  const step = (away - HELEN_FOLLOW_DISTANCE) / away;
  return { x: from.x + dx * step, y: from.y + dy * step };
}

function nearestUncharmedEnemy(world: World, faction: string, from: Point): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;

  for (const entity of world.query(Walker, Position, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) continue;
    if (world.has(entity, Charmed)) continue;

    const pos = world.get(entity, Position)!;
    const d = distance(from, pos);
    if (d < bestDistance) {
      bestDistance = d;
      best = { x: pos.x, y: pos.y };
    }
  }

  return best;
}

/** Every walker トロイのヘレン is currently holding — for tests and for the HUD. */
export function charmedBy(world: World, helen: Entity): Entity[] {
  return world.query(Charmed).filter((entity) => world.get(entity, Charmed)!.by === helen);
}
