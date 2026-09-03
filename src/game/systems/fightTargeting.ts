import type { Entity, System, World } from "../../ecs";
import { FactionState, House, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { distance, type Point } from "./geometry";

/**
 * Under "fight" behaviorMode, a faction's target-less seeking walkers head
 * straight for the nearest enemy walker or house instead of wandering —
 * per docs/game-system.md's "戦闘" influence. Runs before
 * createWanderTargetSystem so it can claim a walker's MoveTarget first;
 * wanderTargetSystem then leaves it alone. Actual combat still happens
 * via walkerCombatSystem/houseCaptureSystem once a walker gets close
 * enough — this system only decides where to walk.
 */
export const fightTargetingSystem: System = (world) => {
  const fightingFactions = factionsInFightMode(world);
  if (fightingFactions.size === 0) return;

  for (const entity of world.query(Position, Walker, Owner)) {
    const owner = world.get(entity, Owner)!;
    if (!fightingFactions.has(owner.faction)) continue;

    const walker = world.get(entity, Walker)!;
    if (walker.state !== "seeking") continue;
    if (world.has(entity, MoveTarget)) continue;

    const target = findNearestEnemyPosition(world, owner.faction, world.get(entity, Position)!);
    if (target) world.add(entity, MoveTarget, target);
  }
};

function factionsInFightMode(world: World): Set<FactionId> {
  const factions = new Set<FactionId>();
  for (const entity of world.query(FactionState)) {
    const state = world.get(entity, FactionState)!;
    if (state.behaviorMode === "fight") factions.add(state.id);
  }
  return factions;
}

export function findNearestEnemyPosition(world: World, faction: FactionId, from: Point): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;

  for (const entity of enemyTargets(world, faction)) {
    const candidate = world.get(entity, Position)!;
    const d = distance(from, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }

  return best;
}

function* enemyTargets(world: World, faction: FactionId): Generator<Entity> {
  for (const entity of world.query(Position, Owner, Walker)) {
    if (world.get(entity, Owner)!.faction !== faction) yield entity;
  }
  for (const entity of world.query(Position, Owner, House)) {
    if (world.get(entity, Owner)!.faction !== faction) yield entity;
  }
}
