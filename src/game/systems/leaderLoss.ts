import type { Entity, System, World } from "../../ecs";
import { FactionState, Owner, Position, Walker, type FactionId } from "../components";

export interface LeaderLossConfig {
  /** Called with the faction that just lost its leader, so the caller can log and score it. */
  onLeaderLost: (faction: FactionId) => void;
}

/**
 * Handles the death of a faction's リーダー — the walker every other one
 * gathers on (see components.ts's leaderId): it reports it, and it leaves
 * the faction's マグネット where the leader fell.
 *
 * **The magnet drops where the leader dies.** 攻略の No.1 spells the whole
 * loop out as a tactic: 「(5)敵リーダーが焼死すると、**マグネットがその場に
 * 残る**。(6)別の敵ウォーカーがマグネットに触れ、リーダーになるまで待つ」,
 * and a later stage says the same from the other side — 「これを倒すと
 * **その場に敵のマグネットが残り**、別の島にいた敵が全体マップでも判るほどの
 * 速さでこのマグネットに向かってきます」.
 *
 * game2 already did this for the *other* way a leader stops being one:
 * hero.ts moves shrinePosition to where the leader stood when it transforms
 * (「変身するとマグネットがリーダーのいた場所へ移動する」, plan/archived/0146).
 * Death is the same event wearing a different hat, and only the promotion
 * half was built — so killing a leader left the enemy's rally point back
 * wherever it had been, and the tactic the guide is describing (drag their
 * magnet onto open ground, then keep picking off whoever walks up to it)
 * did not exist.
 *
 * That the position is *remembered* rather than read at the moment of death
 * is forced: by the time this can tell the leader is gone, the entity is
 * gone too, Position with it. So each tick records where the live leader is
 * standing, and the death uses the last such record.
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
  /** Each live leader's faction and where it was standing on the last tick. */
  let previous = new Map<Entity, { faction: FactionId; position: { x: number; y: number } }>();

  return (world) => {
    const current = new Map<Entity, { faction: FactionId; position: { x: number; y: number } }>();
    for (const entity of world.query(FactionState)) {
      const state = world.get(entity, FactionState)!;
      const leaderId = state.leaderId;
      if (leaderId === undefined) continue;
      if (!world.isAlive(leaderId) || !world.has(leaderId, Walker)) continue;
      const position = world.get(leaderId, Position);
      current.set(leaderId, {
        faction: world.get(leaderId, Owner)?.faction ?? state.id,
        position: position ? { x: position.x, y: position.y } : previous.get(leaderId)?.position ?? state.shrinePosition,
      });
    }

    for (const [entity, { faction, position }] of previous) {
      if (current.has(entity)) continue;
      // Alive and still a walker? Then it was promoted or handed over, not
      // killed — see the doc comment.
      if (world.isAlive(entity) && world.has(entity, Walker)) continue;
      dropMagnetAt(world, faction, position);
      onLeaderLost(faction);
    }

    previous = current;
  };
}

/**
 * Leaves `faction`'s マグネット at `position` — see the doc comment above.
 * Only the magnet moves: leaderId is already empty (the walker is gone),
 * and the faction's standing order is not this system's to change.
 */
function dropMagnetAt(world: World, faction: FactionId, position: { x: number; y: number }): void {
  for (const entity of world.query(FactionState)) {
    const state = world.get(entity, FactionState)!;
    if (state.id !== faction) continue;
    world.add(entity, FactionState, { ...state, shrinePosition: { x: position.x, y: position.y } });
    return;
  }
}
