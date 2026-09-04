import type { Entity, System } from "../../ecs";
import { GATHER_RANGE } from "../constants";
import { FactionState, Owner, Position, Walker } from "../components";
import { distance } from "./geometry";

/**
 * Keeps each faction's FactionState.leaderId pointing at a live walker of
 * that faction, promoting a new one whenever the slot is empty (a fresh
 * game, or the previous leader died) — but only while the faction is under
 * "gather" behaviorMode, per docs/game-system.md's "「集結」で最初に
 * シンボルへ到着した信者がリーダーになる": a leader isn't handed out for
 * free just for existing, it has to be earned by the player actually
 * choosing to gather. gatherTargetingSystem is what walks gather-mode
 * walkers toward the shrine (or the leader, once one exists); this system
 * only watches for the first one to actually get there and promotes it.
 *
 * "Arrived" is approximated as "currently within GATHER_RANGE of the
 * shrine" — the closest this tick-based simulation can get to "collided
 * with the shrine symbol" without a real shrine entity walkers can touch.
 * Whichever eligible walker is nearest wins, which is "first to arrive" in
 * spirit even though several could tie on the same tick.
 */
export const leaderSystem: System = (world) => {
  for (const factionEntity of world.query(FactionState)) {
    const state = world.get(factionEntity, FactionState)!;
    if (state.leaderId !== undefined && world.isAlive(state.leaderId) && world.has(state.leaderId, Walker)) {
      continue;
    }
    if (state.behaviorMode !== "gather") continue;

    let nextLeader: Entity | undefined;
    let nextLeaderDistance = GATHER_RANGE;
    for (const entity of world.query(Walker, Position, Owner)) {
      if (world.get(entity, Owner)!.faction !== state.id) continue;
      if (world.get(entity, Walker)!.state !== "seeking") continue;

      const d = distance(world.get(entity, Position)!, state.shrinePosition);
      if (d <= nextLeaderDistance) {
        nextLeader = entity;
        nextLeaderDistance = d;
      }
    }
    if (nextLeader === undefined) continue;

    world.add(factionEntity, FactionState, { ...state, leaderId: nextLeader });
  }
};
