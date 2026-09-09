import type { Entity, System, World } from "../../ecs";
import { GATHER_RANGE } from "../constants";
import { FactionState, Owner, Position, Walker, type FactionId } from "../components";
import { distance } from "./geometry";

/**
 * Wherever two of a faction's own seeking walkers come within GATHER_RANGE
 * of each other under an order that calls for it, they merge into one,
 * combining strength — per docs/game-system.md, "ウォーカー同士が合流して
 * 1体の強いウォーカーになる". Factions under 定住 or 戦闘 are untouched.
 *
 * 合体 is the order this exists for — 「近くにいる信者達と合体し、その力を
 * 増していく」 — and mergeTargeting.ts is what walks its people into range.
 * The two mustering orders share the pass rather than having one of their
 * own, because the merging they need is the same merging.
 *
 * 集結シンボルへ merges too, not just 集結. The original describes the two
 * as one order and says the merging is the *reason* to give it:
 * 「以後一般信者はリーダーの元へ集うようになる。…よって多数の信者を合体
 * させ、強力なヒーローを生み出すのに不可欠な操作である」. Marching without
 * merging leaves a crowd standing on the leader's toes — and since a
 * mustering faction founds no houses either (see settle.ts), that crowd
 * would do nothing at all.
 */
export const gatherSystem: System = (world) => {
  const gatheringFactions = factionsInMergingMode(world);
  if (gatheringFactions.size === 0) return;

  const leaders = liveLeaders(world);
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

      // The leader is always the one left standing. 集結 gathers people
      // *onto* the leader — gatherTargeting walks them to it, and hero
      // miracles are cast on it — so a follower absorbing its own leader
      // would quietly dissolve the thing the order exists to build, and
      // would read to systems/leaderLoss.ts as the leader having died.
      const [survivor, absorbed] = leaders.has(b) && !leaders.has(a) ? [b, a] : [a, b];
      mergeWalkers(world, survivor, absorbed);
      if (survivor === b) break; // `a` is gone; move on to the next walker
    }
  }
};

/** Every faction's current leader, so a merge never absorbs one — see the merge above. */
function liveLeaders(world: World): Set<Entity> {
  const leaders = new Set<Entity>();
  for (const entity of world.query(FactionState)) {
    const leaderId = world.get(entity, FactionState)!.leaderId;
    if (leaderId !== undefined && world.isAlive(leaderId)) leaders.add(leaderId);
  }
  return leaders;
}

function factionsInMergingMode(world: World): Set<FactionId> {
  const factions = new Set<FactionId>();
  for (const entity of world.query(FactionState)) {
    const state = world.get(entity, FactionState)!;
    if (state.behaviorMode === "gather" || state.behaviorMode === "goToShrine" || state.behaviorMode === "merge") {
      factions.add(state.id);
    }
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
