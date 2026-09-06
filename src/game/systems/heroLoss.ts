import type { Entity, System } from "../../ecs";
import { FactionState, Owner, Walker, isHeroState, type FactionId } from "../components";
import { HERO_DEATH_MANA_LOSS } from "../constants";
import { findFactionEntity } from "../faction";

export interface HeroLossConfig {
  /** Called with the faction that just lost a hero, so the caller can log it. */
  onHeroLost: (faction: FactionId) => void;
}

/**
 * Charges a faction HERO_DEATH_MANA_LOSS whenever one of its heroes dies —
 * the risk half of アドニス (docs/original-miracles.md #10):
 * 「増やしすぎは英雄死亡時のマナ損失というリスクを伴う」.
 *
 * Written as a watcher rather than as a hook at each death site because
 * heroes can die in a dozen different places by now — a fight, a swamp, a
 * crevice, open water, fire, a tornado, a whirlpool, 毒カビ, the final
 * battle — and every one of them would have to remember to charge for it.
 * A watcher cannot forget: it compares the heroes alive this tick against
 * the ones alive last tick, and anything missing was a death, however it
 * happened.
 *
 * A hero that changes sides (聖水の泉) is not a death and must not be
 * charged for, so the record keeps which faction each hero belonged to and
 * only charges when the entity is *gone*, not when its Owner changed.
 *
 * The one hole is entity-id recycling: World hands a freed id straight back
 * out, so a hero that dies and whose id is reused *by another hero of the
 * same faction in the same tick* would go uncharged. That needs a hero to
 * die and a new one to be promoted within a single tick, and the cost of
 * being wrong is one missed 12-mana charge.
 */
export function createHeroLossSystem(config: Partial<HeroLossConfig> = {}): System {
  const onHeroLost = config.onHeroLost ?? (() => {});
  let previous = new Map<Entity, FactionId>();

  return (world) => {
    const current = new Map<Entity, FactionId>();
    for (const entity of world.query(Walker, Owner)) {
      if (!isHeroState(world.get(entity, Walker)!.state)) continue;
      current.set(entity, world.get(entity, Owner)!.faction);
    }

    for (const [entity, faction] of previous) {
      if (current.has(entity)) continue;
      // Still alive as something else? Then it was demoted, not killed —
      // nothing in game2 does that today, but it costs one check to make
      // this watcher mean "died" rather than "stopped being a hero".
      if (world.isAlive(entity) && world.has(entity, Walker)) continue;

      const factionEntity = findFactionEntity(world, faction);
      if (factionEntity === undefined) continue;
      const state = world.get(factionEntity, FactionState)!;
      world.add(factionEntity, FactionState, { ...state, mana: Math.max(0, state.mana - HERO_DEATH_MANA_LOSS) });
      onHeroLost(faction);
    }

    previous = current;
  };
}
