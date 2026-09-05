import type { Entity, System, World } from "../../ecs";
import { isBuildable, type Heightmap } from "../../world/heightmap";
import { FactionState, House, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { hasOtherSeekingWalkers } from "./gatherTargeting";

export interface SettleConfig {
  /** When given, a walker only settles on buildable (above sea level) land. */
  heightmap: Heightmap;
  /**
   * Caps how many houses a faction may ever hold — see houseGrowth.ts's
   * HouseGrowthConfig.maxHousesPerFaction doc comment for why this exists.
   * Settling is the OTHER path (besides houseGrowth's own population
   * overflow) that creates a House entity, so without enforcing the same
   * cap here too, a faction's house count can quietly drift past the cap
   * over a long enough match (any walker already in flight when the cap
   * was first reached still settles normally). Once that happens,
   * houseGrowth's own cap check (`houseCount < maxHousesPerFaction`) never
   * passes again for that faction — permanently blocking every future
   * walker spawn — which, if it happens to both factions at once with no
   * walkers left standing on either side, deadlocks the match forever
   * (nothing left that can fight, capture, or ever tip the population
   * ratio enough to trigger 最終決戦). Skipping settle at the cap instead
   * leaves the walker "seeking" with no MoveTarget, so createWanderTarget
   * System just sends it wandering again next tick — it stays around as
   * available manpower rather than either vanishing into a house or
   * getting stuck.
   */
  maxHousesPerFaction: number;
}

/**
 * A "seeking" walker that has arrived at its target (no MoveTarget left)
 * settles: it builds a hut where it stands and stops existing as a walker.
 * If a heightmap says the spot isn't buildable, it's left as-is — with no
 * MoveTarget, createWanderTargetSystem will hand it a fresh destination
 * next tick. Skipped entirely once a faction's FactionState.finalBattle is
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
  const maxHousesPerFaction = config.maxHousesPerFaction ?? Infinity;

  return (world) => {
    const warringFactions = factionsInFinalBattle(world);
    const gatheringLeaders = currentGatheringLeaders(world);
    const houseCountByFaction = countHousesByFaction(world);

    for (const entity of world.query(Position, Walker, Owner)) {
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;
      if (gatheringLeaders.has(entity)) continue;

      const owner = world.get(entity, Owner)!;
      if (warringFactions.has(owner.faction)) continue;
      if ((houseCountByFaction.get(owner.faction) ?? 0) >= maxHousesPerFaction) continue;

      const pos = world.get(entity, Position)!;
      if (heightmap && !isBuildable(heightmap, pos.x, pos.y)) continue;

      const house = world.createEntity();
      world.add(house, Position, { x: pos.x, y: pos.y });
      world.add(house, Owner, { faction: owner.faction });
      world.add(house, House, { level: "hut", population: 0 });

      world.destroyEntity(entity);
      houseCountByFaction.set(owner.faction, (houseCountByFaction.get(owner.faction) ?? 0) + 1);
    }
  };
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

function countHousesByFaction(world: World): Map<FactionId, number> {
  const counts = new Map<FactionId, number>();
  for (const entity of world.query(House, Owner)) {
    const faction = world.get(entity, Owner)!.faction;
    counts.set(faction, (counts.get(faction) ?? 0) + 1);
  }
  return counts;
}
