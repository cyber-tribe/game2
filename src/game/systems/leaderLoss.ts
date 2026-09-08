import type { Entity, System } from "../../ecs";
import { FactionState, Owner, Walker, type FactionId } from "../components";

export interface LeaderLossConfig {
  /** Called with the faction that just lost its leader, so the caller can log and score it. */
  onLeaderLost: (faction: FactionId) => void;
}

/**
 * Reports the death of a faction's リーダー — the walker every other one
 * gathers on (see components.ts's leaderId).
 *
 * Worth its own watcher because 「敵リーダーを倒す」 is one of the four
 * things the original's score is made of (docs/original-miracles.md), and
 * because a leader can die in every way any other walker can: a fight, a
 * swamp, a crevice, the sea, a miracle. Hooking each of those would mean a
 * dozen sites that must all remember; a watcher cannot forget.
 *
 * Written the same way createHeroLossSystem is, and for the same reason —
 * see its doc comment, including the one hole (entity-id recycling within
 * a single tick).
 *
 * **A promotion is not a death.** promoteHero clears leaderId and the
 * walker walks on as a hero (see hero.ts), so the check is whether the
 * entity is *gone*, not whether it is still the leader.
 */
export function createLeaderLossSystem(config: Partial<LeaderLossConfig> = {}): System {
  const onLeaderLost = config.onLeaderLost ?? (() => {});
  let previous = new Map<Entity, FactionId>();

  return (world) => {
    const current = new Map<Entity, FactionId>();
    for (const entity of world.query(FactionState)) {
      const state = world.get(entity, FactionState)!;
      const leaderId = state.leaderId;
      if (leaderId === undefined) continue;
      if (!world.isAlive(leaderId) || !world.has(leaderId, Walker)) continue;
      current.set(leaderId, world.get(leaderId, Owner)?.faction ?? state.id);
    }

    for (const [entity, faction] of previous) {
      if (current.has(entity)) continue;
      // Alive and still a walker? Then it was promoted or handed over, not
      // killed — see the doc comment.
      if (world.isAlive(entity) && world.has(entity, Walker)) continue;
      onLeaderLost(faction);
    }

    previous = current;
  };
}
