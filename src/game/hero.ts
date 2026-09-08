import type { World } from "../ecs";
import { FactionState, Position, Walker, type FactionId, type HeroKind } from "./components";
import { HERO_TRAITS } from "./constants";
import { findFactionEntity } from "./faction";

/**
 * Turns a faction's current leader into the given hero — the original's
 * one-per-school hero miracles plus game2's own 守護者. A no-op if the
 * faction has no live leader (a fresh game before leaderSystem has run, or
 * a moment where every walker has settled/died).
 *
 * **Promoting consumes the leader**, which is the whole shape of the
 * original's hero loop: 「影響で、味方リーダーがいなくなる。マグネットは
 * リーダーのいた場所に移動する」, repeated verbatim under all six of its
 * heroes. So there is no re-specializing a hero into another hero — the
 * hero is not the leader any more, and the next hero miracle needs a new
 * one, appointed by 集合 the ordinary way. game2 used to leave the promoted
 * walker as leader and keep a `heroBase` around so that cycling it through
 * the hero miracles would not compound their multipliers; with the leader
 * gone at promotion that cycle cannot happen, and both are gone with it.
 *
 * What each hero actually *does* lives where the rule belongs —
 * heroAdvanceTargetingSystem and guardianTargetingSystem decide where it
 * will go, houseCaptureSystem whether it burns or captures, resistsSchool
 * what cannot touch it — and only the two traits that are genuinely
 * numbers are applied here (see HERO_TRAITS).
 *
 * The multipliers apply to the leader's *current* strength rather than to
 * a flat hero figure, because a leader is whatever it has gathered
 * (gather.ts merges walkers into it). Promoting is a multiplier on the
 * army you have already built, not a replacement for building one.
 */
export function promoteHero(world: World, faction: FactionId, kind: HeroKind): void {
  const factionEntity = findFactionEntity(world, faction);
  if (factionEntity === undefined) return;

  const leaderId = world.get(factionEntity, FactionState)!.leaderId;
  if (leaderId === undefined || !world.isAlive(leaderId)) return;

  const walker = world.get(leaderId, Walker);
  if (!walker) return;

  const traits = HERO_TRAITS[kind];
  world.add(leaderId, Walker, {
    ...walker,
    state: kind,
    strength: walker.strength * traits.strength,
    speed: walker.speed * traits.speed,
  });

  // 「影響で、味方リーダーがいなくなる。マグネットはリーダーのいた場所に
  // 移動する」.
  //
  // Both halves matter, and they are the same fact seen twice: the hero
  // walks away from the faction, so the faction has no leader, and the flag
  // it was standing under stays where it stood. What follows is the loop
  // the original is built around — a faction with no leader cannot move its
  // magnet (faction.ts's moveShrine) and must 集合 to appoint another, who
  // walks to that same spot. Leaving the promoted hero as leader instead
  // meant one 集合 bought a leader for the rest of the match.
  const leaderPos = world.get(leaderId, Position);
  const state = world.get(factionEntity, FactionState)!;
  world.add(factionEntity, FactionState, {
    ...state,
    leaderId: undefined,
    shrinePosition: leaderPos ? { x: leaderPos.x, y: leaderPos.y } : state.shrinePosition,
  });
}
