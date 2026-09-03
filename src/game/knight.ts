import type { World } from "../ecs";
import { FactionState, Walker, type FactionId } from "./components";
import { findFactionEntity } from "./faction";

/**
 * The "騎士化" miracle: turns a faction's current leader into a knight.
 * A no-op if the faction has no live leader (a fresh game before
 * leaderSystem has run, or a moment where every walker has settled/died)
 * or the leader is already a knight — per docs/game-system.md, "自軍
 * リーダーを騎士に変える". What being a knight does (ignoring
 * behaviorMode and swamps, burning houses instead of capturing them) is
 * enforced by knightTargetingSystem/swampSystem/houseCaptureSystem
 * reacting to Walker.state === "knight", not by anything here.
 */
export function knightify(world: World, faction: FactionId): void {
  const factionEntity = findFactionEntity(world, faction);
  if (factionEntity === undefined) return;

  const leaderId = world.get(factionEntity, FactionState)!.leaderId;
  if (leaderId === undefined || !world.isAlive(leaderId)) return;

  const walker = world.get(leaderId, Walker);
  if (!walker || walker.state === "knight") return;

  world.add(leaderId, Walker, { ...walker, state: "knight" });
}
