import type { Entity, System, World } from "../../ecs";
import { FactionState, MoveTarget, Owner, Position, Walker } from "../components";
import type { Point } from "./geometry";

/**
 * Under "goToShrine" behaviorMode, the faction's leader heads for
 * shrinePosition and every other target-less seeking walker heads for the
 * leader — per docs/game-system.md, "「集結シンボルへ」...民はリーダーへ、
 * リーダーはシンボルへ向かう（軍勢の誘導）". Runs before
 * createWanderTargetSystem so it can claim a MoveTarget first, and after
 * leaderSystem so state.leaderId is up to date.
 */
export const goToShrineSystem: System = (world) => {
  for (const factionEntity of world.query(FactionState)) {
    const state = world.get(factionEntity, FactionState)!;
    if (state.behaviorMode !== "goToShrine") continue;
    if (state.leaderId === undefined || !world.isAlive(state.leaderId)) continue;

    assignTarget(world, state.leaderId, state.shrinePosition);

    const leaderPos = world.get(state.leaderId, Position);
    if (!leaderPos) continue;

    for (const entity of world.query(Position, Walker, Owner)) {
      if (entity === state.leaderId) continue;
      if (world.get(entity, Owner)!.faction !== state.id) continue;

      assignTarget(world, entity, leaderPos);
    }
  }
};

function assignTarget(world: World, entity: Entity, target: Point): void {
  const walker = world.get(entity, Walker);
  if (!walker || walker.state !== "seeking") return;
  if (world.has(entity, MoveTarget)) return;

  world.add(entity, MoveTarget, { x: target.x, y: target.y });
}
