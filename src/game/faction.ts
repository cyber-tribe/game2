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
