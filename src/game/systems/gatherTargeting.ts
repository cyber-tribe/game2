import type { Entity, System, World } from "../../ecs";
import { FactionState, MoveTarget, Owner, Position, Walker } from "../components";
import type { Point } from "./geometry";

/**
 * Under "gather" behaviorMode, walks the faction's target-less seeking
 * walkers toward wherever they need to be to actually gather: the shrine,
 * while no leader has emerged yet (so someone can arrive and become one —
 * see leaderSystem), or the current leader's position once one exists (so
 * followers physically converge on it and get merged by gatherSystem,
 * instead of only ever merging by chance while wandering). The leader
 * itself is targeted at its own position too — a harmless no-op move that
 * doubles as continuously "claiming" it each tick so
 * createWanderTargetSystem never gets a chance to send it wandering off
 * instead, the same trick goToShrineSystem uses for its own leader.
 */
export const gatherTargetingSystem: System = (world) => {
  for (const factionEntity of world.query(FactionState)) {
    const state = world.get(factionEntity, FactionState)!;
    if (state.behaviorMode !== "gather") continue;

    const leader =
      state.leaderId !== undefined && world.isAlive(state.leaderId) && world.has(state.leaderId, Walker)
        ? state.leaderId
        : undefined;
    const leaderPos = leader !== undefined ? world.get(leader, Position) : undefined;
    const targetPosition: Point = leaderPos ?? state.shrinePosition;

    for (const entity of world.query(Position, Walker, Owner)) {
      if (world.get(entity, Owner)!.faction !== state.id) continue;

      assignTarget(world, entity, targetPosition);
    }
  }
};

function assignTarget(world: World, entity: Entity, target: Point): void {
  const walker = world.get(entity, Walker);
  if (!walker || walker.state !== "seeking") return;
  if (world.has(entity, MoveTarget)) return;

  world.add(entity, MoveTarget, { x: target.x, y: target.y });
}
