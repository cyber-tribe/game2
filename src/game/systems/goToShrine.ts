import type { Entity, System, World } from "../../ecs";
import { Infected, Charmed, FactionState, MoveTarget, Owner, Position, Walker } from "../components";
import type { Point } from "./geometry";

/**
 * Under "goToShrine" behaviorMode, the faction's leader heads for
 * shrinePosition and every other target-less seeking walker heads for the
 * leader — per docs/game-system.md, "「集結シンボルへ」...民はリーダーへ、
 * リーダーはシンボルへ向かう（軍勢の誘導）". Runs before
 * createWanderTargetSystem so it can claim a MoveTarget first, and after
 * leaderSystem so state.leaderId is up to date.
 *
 * **The final battle is not led.** Once finalBattle is set (see
 * armageddon.ts) every walker heads for shrinePosition itself, leader or
 * no leader — 「全ての民が家を捨てて中央に集まり」, and the middle is a
 * place, not a person.
 *
 * That is not a stylistic difference. Leader-following silently requires
 * a live leader, and nothing appoints a new one during the final battle
 * (leaderSystem only ever appoints while a faction is gathering — see
 * leader.ts). Measured over five matches that reached 最終決戦, a
 * faction's leader died mid-battle in four of them, and the moment it
 * did, that faction's whole army stopped marching and went back to
 * wandering: one side sat at the middle with 171 walkers while the other
 * 54 drifted around the map, never meeting. Since Simulation.getOutcome()
 * ends a match only when a faction has neither walkers nor houses, those
 * matches ran forever — still undecided after 40 minutes.
 */
export const goToShrineSystem: System = (world) => {
  for (const factionEntity of world.query(FactionState)) {
    const state = world.get(factionEntity, FactionState)!;
    if (state.behaviorMode !== "goToShrine") continue;

    if (state.finalBattle) {
      for (const entity of world.query(Position, Walker, Owner)) {
        if (world.has(entity, Charmed)) continue;
        // 病原菌 「ハルマゲドンにも参加できない」 — the sick sit it out.
        if (world.has(entity, Infected)) continue;
        if (world.get(entity, Owner)!.faction !== state.id) continue;

        assignTarget(world, entity, state.shrinePosition);
      }
      continue;
    }

    // No leader yet — everyone walks to the symbol itself, and whoever
    // gets there first is promoted (leaderSystem). This is the first half
    // of the original's own description of the order: 「フィールド上の
    // 信者達を、シンボルへ集める。…最初に辿り着いた信者は「リーダー」と
    // なり、以後一般信者はリーダーの元へ集うようになる」.
    //
    // Without it the order could not start itself. Leader-following needs a
    // leader, nothing here sent anyone to the shrine to become one, and
    // leaderSystem only promotes a walker that has actually arrived — so a
    // player who picked 集結シンボルへ before ever gathering got a mode that
    // did nothing at all, and their walkers wandered off and settled.
    if (state.leaderId === undefined || !world.isAlive(state.leaderId)) {
      for (const entity of world.query(Position, Walker, Owner)) {
        if (world.has(entity, Charmed)) continue;
        if (world.get(entity, Owner)!.faction !== state.id) continue;

        assignTarget(world, entity, state.shrinePosition);
      }
      continue;
    }

    assignTarget(world, state.leaderId, state.shrinePosition);

    const leaderPos = world.get(state.leaderId, Position);
    if (!leaderPos) continue;

    for (const entity of world.query(Position, Walker, Owner)) {
      if (world.has(entity, Charmed)) continue;
      // 病原菌 「ハルマゲドンにも参加できない」 — the sick do not answer the
      // call to the middle. See armageddon.ts, which sets this mode.
      if (world.has(entity, Infected)) continue;
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
