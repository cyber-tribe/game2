import type { System, World } from "../../ecs";
import { isBuildable, type Heightmap } from "../../world/heightmap";
import { FactionState, House, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";

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
 */
export function createSettleSystem(config: Partial<SettleConfig> = {}): System {
  const heightmap = config.heightmap;
  const maxHousesPerFaction = config.maxHousesPerFaction ?? Infinity;

  return (world) => {
    const warringFactions = factionsInFinalBattle(world);
    const houseCountByFaction = countHousesByFaction(world);

    for (const entity of world.query(Position, Walker, Owner)) {
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;

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

function countHousesByFaction(world: World): Map<FactionId, number> {
  const counts = new Map<FactionId, number>();
  for (const entity of world.query(House, Owner)) {
    const faction = world.get(entity, Owner)!.faction;
    counts.set(faction, (counts.get(faction) ?? 0) + 1);
  }
  return counts;
}
