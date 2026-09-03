import type { Entity, System, World } from "../../ecs";
import { GATHER_RANGE } from "../constants";
import { FactionState, Owner, Position, Walker, type FactionId } from "../components";
import { distance } from "./geometry";

/**
 * Under "gather" behaviorMode, a faction's own seeking walkers within
 * GATHER_RANGE of each other merge into one, combining strength — per
 * docs/game-system.md, "ウォーカー同士が合流して1体の強いウォーカーに
 * なる". Factions not in "gather" mode are untouched.
 */
export const gatherSystem: System = (world) => {
  const gatheringFactions = factionsInGatherMode(world);
  if (gatheringFactions.size === 0) return;

  const walkers = world.query(Position, Walker, Owner);

  for (let i = 0; i < walkers.length; i++) {
    const a = walkers[i];
    if (!world.isAlive(a) || !isGatheringWalker(world, a, gatheringFactions)) continue;

    for (let j = i + 1; j < walkers.length; j++) {
      const b = walkers[j];
      if (!world.isAlive(b)) continue;
      if (world.get(a, Owner)!.faction !== world.get(b, Owner)!.faction) continue;
      if (!isGatheringWalker(world, b, gatheringFactions)) continue;
      if (distance(world.get(a, Position)!, world.get(b, Position)!) > GATHER_RANGE) continue;

      mergeWalkers(world, a, b);
    }
  }
};

function factionsInGatherMode(world: World): Set<FactionId> {
  const factions = new Set<FactionId>();
  for (const entity of world.query(FactionState)) {
    const state = world.get(entity, FactionState)!;
    if (state.behaviorMode === "gather") factions.add(state.id);
  }
  return factions;
}

function isGatheringWalker(world: World, entity: Entity, gatheringFactions: Set<FactionId>): boolean {
  if (!gatheringFactions.has(world.get(entity, Owner)!.faction)) return false;
  return world.get(entity, Walker)!.state === "seeking";
}

function mergeWalkers(world: World, survivor: Entity, absorbed: Entity): void {
  const survivorWalker = world.get(survivor, Walker)!;
  const absorbedWalker = world.get(absorbed, Walker)!;
  world.add(survivor, Walker, {
    ...survivorWalker,
    strength: survivorWalker.strength + absorbedWalker.strength,
  });
  world.destroyEntity(absorbed);
}
