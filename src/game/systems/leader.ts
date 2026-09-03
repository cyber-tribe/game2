import type { System } from "../../ecs";
import { FactionState, Owner, Walker } from "../components";

/**
 * Keeps each faction's FactionState.leaderId pointing at a live walker of
 * that faction, promoting a new one whenever the slot is empty (a fresh
 * game, or the previous leader died) — per docs/game-system.md, "自陣営の
 * ウォーカーのうち1体がリーダーとなる". Which walker gets picked is a
 * simplification: the real rule ("集結シンボルに最初に触れた者") would need
 * a physical shrine entity walkers can collide with, which doesn't exist
 * here — any live walker of the faction is promoted instead.
 */
export const leaderSystem: System = (world) => {
  for (const factionEntity of world.query(FactionState)) {
    const state = world.get(factionEntity, FactionState)!;
    if (state.leaderId !== undefined && world.isAlive(state.leaderId) && world.has(state.leaderId, Walker)) {
      continue;
    }

    const nextLeader = world.query(Walker, Owner).find((entity) => world.get(entity, Owner)!.faction === state.id);
    if (nextLeader === undefined) continue;

    world.add(factionEntity, FactionState, { ...state, leaderId: nextLeader });
  }
};
