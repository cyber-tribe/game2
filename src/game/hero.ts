import type { World } from "../ecs";
import { FactionState, Walker, type FactionId, type WalkerState } from "./components";
import { findFactionEntity } from "./faction";

/**
 * Turns a faction's current leader into the given hero kind ("知恵/騎士化"
 * or "守護者化" — see WalkerState/isHeroState). A no-op if the faction has
 * no live leader (a fresh game before leaderSystem has run, or a moment
 * where every walker has settled/died) or the leader is already that exact
 * kind — per docs/game-system.md, "自軍リーダーを騎士に変える". Re-casting
 * a different hero miracle on an already-hero leader re-specializes it
 * (e.g. a knight can become a guardian), which is a deliberate mana sink,
 * not a bug. What each kind actually does (ignoring behaviorMode and
 * swamps, how it resolves enemy houses) is enforced by knightTargetingSystem/
 * guardianTargetingSystem/swampSystem/houseCaptureSystem reacting to
 * Walker.state, not by anything here.
 */
function promoteHero(world: World, faction: FactionId, kind: WalkerState): void {
  const factionEntity = findFactionEntity(world, faction);
  if (factionEntity === undefined) return;

  const leaderId = world.get(factionEntity, FactionState)!.leaderId;
  if (leaderId === undefined || !world.isAlive(leaderId)) return;

  const walker = world.get(leaderId, Walker);
  if (!walker || walker.state === kind) return;

  world.add(leaderId, Walker, { ...walker, state: kind });
}

/** The "騎士化" miracle — turns a faction's current leader into a knight. */
export function knightify(world: World, faction: FactionId): void {
  promoteHero(world, faction, "knight");
}

/** The "守護者化" miracle — turns a faction's current leader into a guardian. */
export function guardianify(world: World, faction: FactionId): void {
  promoteHero(world, faction, "guardian");
}
