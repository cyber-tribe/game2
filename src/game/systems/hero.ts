import type { System, World } from "../../ecs";
import { HeroCooldown, House, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { GUARDIAN_DEFENSE_RADIUS } from "../constants";
import { distance, type Point } from "./geometry";
import { findNearestEnemyPosition } from "./fightTargeting";

/**
 * A knight always seeks out the nearest enemy walker or house, regardless
 * of its faction's behaviorMode — per docs/game-system.md, "指示に
 * 依存せず戦い続ける". Unlike fightTargetingSystem (which only acts on
 * "seeking" walkers under "fight" mode), this targets every "knight"-state
 * walker unconditionally, anywhere on the map — the opposite extreme from
 * guardianTargetingSystem's home-turf-only reach below.
 *
 * Skips a knight currently under HeroCooldown (see its doc comment):
 * without a pause after each burn, a knight instantly retargets and
 * marches the moment it arrives, so one knight could level a whole
 * undefended settlement in seconds — collapsing a match's
 * "小競り合い→復興/逆転" phases into a single instant.
 */
export const knightTargetingSystem: System = (world) => {
  for (const entity of world.query(Position, Walker, Owner)) {
    const walker = world.get(entity, Walker)!;
    if (walker.state !== "knight") continue;
    if (world.has(entity, MoveTarget)) continue;
    if (world.has(entity, HeroCooldown)) continue;

    const owner = world.get(entity, Owner)!;
    const target = findNearestEnemyPosition(world, owner.faction, world.get(entity, Position)!);
    if (target) world.add(entity, MoveTarget, target);
  }
};

/**
 * A guardian, unlike a knight, doesn't roam the map hunting — it only
 * engages an enemy walker/house that's within GUARDIAN_DEFENSE_RADIUS of
 * one of its OWN faction's houses, i.e. an actual threat to home turf.
 * With nothing threatening any of its houses (including having none left
 * at all), it's left target-less and simply stands its ground rather than
 * chasing — the "守護者" is a defender, not a raider.
 *
 * Also skipped while under HeroCooldown, same reasoning as
 * knightTargetingSystem above (a guardian survives a successful capture —
 * see houseCaptureSystem — so without this it could otherwise capture
 * through an entire undefended cluster the instant it arrives at each).
 */
export const guardianTargetingSystem: System = (world) => {
  for (const entity of world.query(Position, Walker, Owner)) {
    const walker = world.get(entity, Walker)!;
    if (walker.state !== "guardian") continue;
    if (world.has(entity, MoveTarget)) continue;
    if (world.has(entity, HeroCooldown)) continue;

    const owner = world.get(entity, Owner)!;
    const threat = findNearestThreatToOwnHouses(world, owner.faction, world.get(entity, Position)!);
    if (threat) world.add(entity, MoveTarget, threat);
  }
};

/**
 * Among this faction's own houses that currently have an enemy walker/house
 * within GUARDIAN_DEFENSE_RADIUS, returns the position of whichever such
 * threat is closest to `from` (the guardian itself) — so a guardian
 * responds to the crisis nearest to it, not just the first house checked.
 * O(houses × enemies), same order as the rest of this prototype's combat
 * systems (see e.g. createWalkerCombatSystem's own doc comment).
 */
function findNearestThreatToOwnHouses(world: World, faction: FactionId, from: Point): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;

  for (const houseEntity of world.query(Position, House, Owner)) {
    if (world.get(houseEntity, Owner)!.faction !== faction) continue;
    const housePos = world.get(houseEntity, Position)!;

    const threat = findNearestEnemyPosition(world, faction, housePos);
    if (!threat || distance(housePos, threat) > GUARDIAN_DEFENSE_RADIUS) continue;

    const d = distance(from, threat);
    if (d < bestDistance) {
      bestDistance = d;
      best = threat;
    }
  }

  return best;
}

/** Counts down HeroCooldown, removing it once a hero's rest is over. */
export const heroCooldownSystem: System = (world, deltaSeconds) => {
  for (const entity of world.query(HeroCooldown)) {
    const remaining = world.get(entity, HeroCooldown)!.remaining - deltaSeconds;
    if (remaining <= 0) {
      world.remove(entity, HeroCooldown);
    } else {
      world.add(entity, HeroCooldown, { remaining });
    }
  }
};
