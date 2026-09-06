import type { World } from "../ecs";
import { FactionState, Walker, type FactionId, type HeroKind } from "./components";
import { HERO_TRAITS } from "./constants";
import { findFactionEntity } from "./faction";

/**
 * Turns a faction's current leader into the given hero — the original's
 * one-per-element hero miracles (docs/original-miracles.md #3/#15/#19/#23)
 * plus game2's own 守護者. A no-op if the faction has no live leader (a
 * fresh game before leaderSystem has run, or a moment where every walker
 * has settled/died) or the leader is already that exact hero.
 *
 * Re-casting a different hero miracle on an already-promoted leader
 * re-specializes it (a ペルセウス can become a ヘラクレス), which is a
 * deliberate mana sink, not a bug. What each hero actually *does* lives
 * where the rule belongs — heroAdvanceTargetingSystem and
 * guardianTargetingSystem decide where it will go, houseCaptureSystem
 * whether it burns or captures, creviceSystem whether the ground can
 * swallow it, fire.ts whether it burns — and only the two traits that are
 * genuinely numbers are applied here (see HERO_TRAITS).
 *
 * The multipliers apply to the leader's *current* strength rather than to
 * a flat hero figure, because a leader is whatever it has gathered
 * (gather.ts merges walkers into it). Promoting is a multiplier on the
 * army you have already built, not a replacement for building one.
 *
 * Applied from the walker's base rather than compounding: re-casting
 * ヘラクレス on a ヘラクレス is refused above, and re-specializing from one
 * hero to another re-derives both numbers from the pre-promotion base kept
 * in `heroBase`, so a leader cycled through every hero miracle ends up
 * exactly where casting that last one directly would have put it.
 */
export function promoteHero(world: World, faction: FactionId, kind: HeroKind): void {
  const factionEntity = findFactionEntity(world, faction);
  if (factionEntity === undefined) return;

  const leaderId = world.get(factionEntity, FactionState)!.leaderId;
  if (leaderId === undefined || !world.isAlive(leaderId)) return;

  const walker = world.get(leaderId, Walker);
  if (!walker || walker.state === kind) return;

  const base = walker.heroBase ?? { strength: walker.strength, speed: walker.speed };
  const traits = HERO_TRAITS[kind];
  world.add(leaderId, Walker, {
    ...walker,
    state: kind,
    heroBase: base,
    strength: base.strength * traits.strength,
    speed: base.speed * traits.speed,
  });
}
