import type { Entity, System, World } from "../../ecs";
import { countFlatNeighbors, isBuildable, type Heightmap } from "../../world/heightmap";
import { Charmed, FactionState, House, Infected, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { HOUSE_SETTLE_FLATNESS_REQUIREMENT, HOUSE_SPACING, HOUSE_UPGRADE_FLATNESS_RADIUS } from "../constants";
import { hasOtherSeekingWalkers } from "./gatherTargeting";
import { distance } from "./geometry";

export interface SettleConfig {
  /**
   * When given, a walker only settles on buildable (above sea level) land
   * that is also flat enough to build on — see
   * HOUSE_SETTLE_FLATNESS_REQUIREMENT. Without a heightmap there is no
   * terrain to judge, and any spot will do (tests that don't care).
   */
  heightmap: Heightmap;
}

/**
 * A "seeking" walker that has arrived at its target (no MoveTarget left)
 * settles: it builds a hut where it stands and stops existing as a walker.
 * If a heightmap says the spot isn't buildable, or isn't flat enough to
 * build on (HOUSE_SETTLE_FLATNESS_REQUIREMENT), it's left as-is — with no
 * MoveTarget, createWanderTargetSystem will hand it a fresh destination
 * next tick, biased toward ground it can actually settle on.
 *
 * Those two terrain checks, plus HOUSE_SPACING, are the *whole* limit on
 * how far a faction expands: there is no per-faction house cap any more
 * (plan/0118-terrain-based-house-limit.md). A faction with nowhere left to
 * build does not stop growing, it just stops converting walkers into
 * houses — they stay "seeking" and pile up as manpower, which is what
 * turns a finished economy into an army.
 *
 * Skipped entirely once a faction's FactionState.finalBattle is
 * set (the "最終決戦" miracle) — otherwise walkers converging on the
 * shared shrine would just found a peaceful town there instead of fighting.
 *
 * Also skipped for whichever walker is currently serving as a "gather"-mode
 * faction's leader, but only while there's still someone left to gather
 * (see gatherTargeting.ts's hasOtherSeekingWalkers): that walker is
 * targeted at its own position every tick while it waits at the shrine for
 * followers to merge into it (gatherTargetingSystem), which — like any
 * other 0-distance target — clears instantly, so without this exclusion it
 * would settle into a house the very same tick it's promoted, instead of
 * ever getting the chance to gather a crowd or become a hero. Once nobody
 * else of that faction is still "seeking" (everyone left is already
 * merged in, dead, fighting, knighted, or settled), the exclusion lifts —
 * per docs/game-system.md's "合体対象がいない場合は定住" — and this
 * leader settles down like any other idle walker instead of standing at
 * the flag forever with nothing left to gain from waiting.
 */
export function createSettleSystem(config: Partial<SettleConfig> = {}): System {
  const heightmap = config.heightmap;

  return (world) => {
    const warringFactions = factionsInFinalBattle(world);
    const gatheringLeaders = currentGatheringLeaders(world);
    // Rebuilt per tick and appended to as houses go up, so two walkers
    // standing together cannot both settle on the same spot in one pass.
    const occupied = world.query(Position, House).map((entity) => world.get(entity, Position)!);

    for (const entity of world.query(Position, Walker, Owner)) {
      // 「建物から引き離し」 — someone Helen is dragging around does not
      // stop and found a house wherever she happens to lead them.
      if (world.has(entity, Charmed)) continue;
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;
      if (gatheringLeaders.has(entity)) continue;

      const owner = world.get(entity, Owner)!;
      if (warringFactions.has(owner.faction)) continue;

      const pos = world.get(entity, Position)!;
      if (heightmap && !isSettleable(heightmap, pos.x, pos.y)) continue;
      // Not on top of a house that is already there — see HOUSE_SPACING.
      // A walker refused here simply stays "seeking" and is given somewhere
      // else to be on a later tick (wanderTarget.ts), so nothing stalls.
      if (occupied.some((house) => distance(house, pos) < HOUSE_SPACING)) continue;

      const house = world.createEntity();
      world.add(house, Position, { x: pos.x, y: pos.y });
      world.add(house, Owner, { faction: owner.faction });
      world.add(house, House, { level: "hut", population: 0 });
      // 病原菌 travels home with whoever carries it: a sick walker founds a
      // sick house, which is how one case outlives the person who had it
      // and keeps costing its faction mana (systems/mana.ts).
      const infection = world.get(entity, Infected);
      if (infection) world.add(house, Infected, { ...infection });

      world.destroyEntity(entity);
      occupied.push({ x: pos.x, y: pos.y });
    }
  };
}

/**
 * Whether a house could stand at (x, y) as far as the *ground* is
 * concerned: dry, unspoiled land (isBuildable) that is also flat enough to
 * build on (HOUSE_SETTLE_FLATNESS_REQUIREMENT). Says nothing about
 * whether another house is already there — that's HOUSE_SPACING, which
 * only createSettleSystem checks, since it needs the live world to know.
 *
 * Shared with wanderTarget.ts so idle walkers head for ground they can
 * actually build on instead of rediscovering by trial and error that most
 * of a rumpled map is unsettleable.
 */
export function isSettleable(heightmap: Heightmap, x: number, y: number): boolean {
  return (
    isBuildable(heightmap, x, y) &&
    countFlatNeighbors(heightmap, x, y, HOUSE_UPGRADE_FLATNESS_RADIUS) >= HOUSE_SETTLE_FLATNESS_REQUIREMENT
  );
}

function factionsInFinalBattle(world: World): Set<FactionId> {
  const factions = new Set<FactionId>();
  for (const entity of world.query(FactionState)) {
    const state = world.get(entity, FactionState)!;
    if (state.finalBattle) factions.add(state.id);
  }
  return factions;
}

function currentGatheringLeaders(world: World): Set<Entity> {
  const leaders = new Set<Entity>();
  for (const entity of world.query(FactionState)) {
    const state = world.get(entity, FactionState)!;
    if (state.behaviorMode !== "gather" || state.leaderId === undefined) continue;
    if (!world.isAlive(state.leaderId) || !world.has(state.leaderId, Walker)) continue;
    if (hasOtherSeekingWalkers(world, state.id, state.leaderId)) leaders.add(state.leaderId);
  }
  return leaders;
}

