import type { Entity, System, World } from "../../ecs";
import { Charmed, FactionState, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { MERGE_SEEK_RADIUS } from "../constants";
import { distance, type Point } from "./geometry";

/**
 * 合体 — the fourth 神の啓示, and the one game2 was missing.
 *
 * 「近くにいる信者達と合体し、その力を増していく。近くに他の信者がいない
 * 場合は定住に同じ」.
 *
 * Under this order a target-less seeking walker heads for the nearest other
 * seeking walker of its own faction within MERGE_SEEK_RADIUS. Once the two
 * are close enough, gatherSystem — which already does the merging for the
 * mustering orders — folds them into one walker with their combined
 * strength.
 *
 * What it deliberately does *not* do is the rest of 集合. There is no
 * shrine to walk to, leaderSystem promotes nobody (it only looks at
 * "gather"/"goToShrine"), so no leader turns into a hero, and settle.ts
 * never suspends building for this mode. That is the whole distinction
 * between the two orders in the original: 集合 sends everyone to a *place*
 * and stops the economy while they walk; 合体 sends them into *each other*
 * and leaves the economy running.
 *
 * The fallback is not a special case here but a consequence of doing
 * nothing: a walker with no one in range keeps its empty target slot,
 * createWanderTargetSystem hands it somewhere to be, and createSettleSystem
 * builds a hut when it arrives — 「定住に同じ」, by simply staying out of
 * the way.
 */
export const mergeTargetingSystem: System = (world) => {
  const mergingFactions = factionsInMergeMode(world);
  if (mergingFactions.size === 0) return;

  const candidates = world.query(Position, Walker, Owner).filter((entity) => isMergeable(world, entity, mergingFactions));

  for (const entity of candidates) {
    if (world.has(entity, MoveTarget)) continue;

    const partner = nearestPartner(world, entity, candidates);
    if (!partner) continue;

    world.add(entity, MoveTarget, { x: partner.x, y: partner.y });
  }
};

function factionsInMergeMode(world: World): Set<FactionId> {
  const factions = new Set<FactionId>();
  for (const entity of world.query(FactionState)) {
    const state = world.get(entity, FactionState)!;
    if (state.behaviorMode === "merge") factions.add(state.id);
  }
  return factions;
}

/**
 * Merging is for a faction's free walkers: someone already fighting, out
 * on a hero's errand, or being dragged around by トロイのヘレン is not
 * available to be folded into a neighbour, and must not be walked at as if
 * it were.
 */
function isMergeable(world: World, entity: Entity, mergingFactions: Set<FactionId>): boolean {
  if (world.has(entity, Charmed)) return false;
  if (!mergingFactions.has(world.get(entity, Owner)!.faction)) return false;
  return world.get(entity, Walker)!.state === "seeking";
}

/**
 * The nearest same-faction candidate within MERGE_SEEK_RADIUS, or undefined
 * if the walker is on its own out here. Nearest rather than first so a
 * crowd converges inward pair by pair instead of everyone streaming past
 * each other toward whoever happens to hold the lowest entity id.
 */
function nearestPartner(world: World, entity: Entity, candidates: readonly Entity[]): Point | undefined {
  const pos = world.get(entity, Position)!;
  const faction = world.get(entity, Owner)!.faction;

  let best: Point | undefined;
  let bestDistance = MERGE_SEEK_RADIUS;

  for (const other of candidates) {
    if (other === entity) continue;
    if (world.get(other, Owner)!.faction !== faction) continue;

    const otherPos = world.get(other, Position)!;
    const gap = distance(pos, otherPos);
    if (gap > bestDistance) continue;

    best = otherPos;
    bestDistance = gap;
  }

  return best;
}
