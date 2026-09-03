import type { System, World } from "../../ecs";
import { isBuildable, type Heightmap } from "../../world/heightmap";
import { FactionState, House, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";

export interface SettleConfig {
  /** When given, a walker only settles on buildable (above sea level) land. */
  heightmap: Heightmap;
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

  return (world) => {
    const warringFactions = factionsInFinalBattle(world);

    for (const entity of world.query(Position, Walker, Owner)) {
      const walker = world.get(entity, Walker)!;
      if (walker.state !== "seeking") continue;
      if (world.has(entity, MoveTarget)) continue;

      const owner = world.get(entity, Owner)!;
      if (warringFactions.has(owner.faction)) continue;

      const pos = world.get(entity, Position)!;
      if (heightmap && !isBuildable(heightmap, pos.x, pos.y)) continue;

      const house = world.createEntity();
      world.add(house, Position, { x: pos.x, y: pos.y });
      world.add(house, Owner, { faction: owner.faction });
      world.add(house, House, { level: "hut", population: 0 });

      world.destroyEntity(entity);
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
