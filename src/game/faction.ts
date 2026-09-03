import type { Entity, World } from "../ecs";
import { FactionState, type BehaviorMode, type FactionId, type Position } from "./components";

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
