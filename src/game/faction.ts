import type { Entity, World } from "../ecs";
import { FactionState, Walker, type BehaviorMode, type FactionId, type Position } from "./components";

/** Creates the one entity that tracks a side's mana and influence mode. */
export function createFaction(
  world: World,
  id: FactionId,
  shrinePosition: Position,
  behaviorMode: BehaviorMode = "settle",
): Entity {
  const entity = world.createEntity();
  world.add(entity, FactionState, { id, mana: 0, behaviorMode, shrinePosition });
  return entity;
}

/** Finds the FactionState entity for a given side, if it has been created. */
export function findFactionEntity(world: World, id: FactionId): Entity | undefined {
  for (const entity of world.query(FactionState)) {
    if (world.get(entity, FactionState)!.id === id) return entity;
  }
  return undefined;
}

/**
 * Deducts a miracle's mana cost from a faction if (and only if) it can
 * afford it. Every divine power — terrain edits included — spends mana
 * through this, so "can't afford it" and "faction doesn't exist" are
 * both just a `false` return rather than a thrown error.
 */
export function trySpendMana(world: World, id: FactionId, amount: number): boolean {
  const entity = findFactionEntity(world, id);
  if (entity === undefined) return false;

  const state = world.get(entity, FactionState)!;
  if (state.mana < amount) return false;

  world.add(entity, FactionState, { ...state, mana: state.mana - amount });
  return true;
}

/**
 * Moves a faction's shrinePosition — the "集結シンボル移動" miracle. Per
 * docs/game-system.md this only relocates the target the leader/army walk
 * toward under "goToShrine" mode; it doesn't move anyone immediately.
 */
export function moveShrine(world: World, id: FactionId, position: Position): boolean {
  const entity = findFactionEntity(world, id);
  if (entity === undefined) return false;

  const state = world.get(entity, FactionState)!;
  // 「ただし、リーダーがいない状態ではこのコマンドは使用できない(リーダーが
  // いない場合は、まず啓示コマンドの「集合」でリーダーを作る必要がある)」.
  //
  // The magnet is the leader's, not the faction's: without one there is
  // nobody for it to lead and nothing to relocate. This is what makes
  // 集合 the opening move of an invasion rather than an optional extra —
  // you cannot plant the flag in the enemy's town until you have someone
  // to send to it. Refuses rather than moving silently so callers can
  // charge for it only when it happens (see main.ts).
  if (!hasLiveLeader(world, state)) return false;

  world.add(entity, FactionState, { ...state, shrinePosition: position });
  return true;
}

/** Whether `state` still points at a live walker of its own faction — shared with the systems that steer by the leader. */
export function hasLiveLeader(world: World, state: FactionState): boolean {
  const leaderId = state.leaderId;
  return leaderId !== undefined && world.isAlive(leaderId) && world.has(leaderId, Walker);
}
