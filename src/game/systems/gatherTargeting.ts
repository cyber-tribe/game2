import type { Entity, System, World } from "../../ecs";
import { FactionState, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
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
 *
 * Once nobody else of this faction is still "seeking" (see
 * hasOtherSeekingWalkers) — everyone left is already merged into the
 * leader, dead, fighting, knighted, or settled — the leader itself is left
 * target-less instead of endlessly re-pinned: per docs/game-system.md's
 * "合体対象がいない場合は定住"（gather falls back to settling once there's
 * truly nothing left to gather with, the same way fightTargetingSystem
 * already leaves a walker target-less once no enemy exists anywhere),
 * createWanderTargetSystem/createSettleSystem then treat it like any other
 * idle walker instead of it standing at the flag forever with no prospect
 * of ever growing into anything. settle.ts's own leader exclusion checks
 * the same condition so the two stay in sync.
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
    const leaderHasNoOneLeftToGather = leader !== undefined && !hasOtherSeekingWalkers(world, state.id, leader);

    for (const entity of world.query(Position, Walker, Owner)) {
      if (world.get(entity, Owner)!.faction !== state.id) continue;
      if (entity === leader && leaderHasNoOneLeftToGather) continue;

      assignTarget(world, entity, targetPosition);
    }
  }
};

/**
 * Whether any OTHER walker of `factionId` (besides `excluding`, normally
 * the leader) is still in the "seeking" state — i.e., could still show up
 * to be gathered. Shared with settle.ts so a gather-mode leader's
 * "still waiting for a crowd" exclusion from settling matches exactly the
 * condition under which this system keeps it pinned in place.
 */
export function hasOtherSeekingWalkers(world: World, factionId: FactionId, excluding: Entity): boolean {
  for (const entity of world.query(Walker, Owner)) {
    if (entity === excluding) continue;
    if (world.get(entity, Owner)!.faction !== factionId) continue;
    if (world.get(entity, Walker)!.state === "seeking") return true;
  }
  return false;
}

function assignTarget(world: World, entity: Entity, target: Point): void {
  const walker = world.get(entity, Walker);
  if (!walker || walker.state !== "seeking") return;
  if (world.has(entity, MoveTarget)) return;

  world.add(entity, MoveTarget, { x: target.x, y: target.y });
}
