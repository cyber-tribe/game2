import type { System } from "../../ecs";
import { isFungus, spreadFungus, type Heightmap } from "../../world/heightmap";
import { FUNGUS_GROWTH_INTERVAL } from "../constants";
import { House, Position, Walker } from "../components";
import type { OnImpactEffect } from "./effects";

export interface FungusConfig {
  /**
   * The world's terrain. Optional to match the other heightmap-reading
   * systems: several tests build a Simulation without one, and 毒カビ
   * cannot exist at all without ground to rot.
   */
  heightmap: Heightmap;
  /** Called once per walker or house swallowed — see systems/effects.ts. */
  onImpact: OnImpactEffect;
  /** Called after a growth step that changed the map, so the caller can redraw. */
  onSpread: () => void;
}

/**
 * Grows every 毒カビ patch and swallows whatever the rot reaches — the
 * original's "増殖する沼に近い。複数設置すると大繁殖し建物や信者を飲み込む"
 * (docs/original-miracles.md #9).
 *
 * Two separate jobs on two separate clocks, deliberately. Growth is
 * stepped every FUNGUS_GROWTH_INTERVAL seconds — a cellular automaton
 * needs discrete generations, and running it per frame would make its
 * spread rate a function of the framerate. Swallowing runs every tick, like
 * creviceSystem: what makes a patch dangerous is walking into it later, not
 * only being caught inside the generation that grew over you.
 *
 * Heroes die here like anyone else, same as swampSystem's "踏み込んだ通常
 * の民は沈んで死ぬ" — nothing special-cases isHeroState.
 */
export function createFungusSystem(config: Partial<FungusConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});
  const onSpread = config.onSpread ?? (() => {});
  const heightmap = config.heightmap;
  let sinceGrowth = 0;

  return (world, deltaSeconds) => {
    if (!heightmap) return;

    sinceGrowth += deltaSeconds;
    if (sinceGrowth >= FUNGUS_GROWTH_INTERVAL) {
      sinceGrowth = 0;
      const { grown, withered } = spreadFungus(heightmap);
      if (grown.length > 0 || withered.length > 0) onSpread();
    }

    // Reported as "drowned" (a walker sinking into rot, like a swamp) and
    // "houseBurned" (a building destroyed outright) — ImpactEffectType is
    // purely cosmetic, so this borrows the two effects that already look
    // right rather than inventing a third.
    for (const entity of world.query(House, Position)) {
      const pos = world.get(entity, Position)!;
      if (!isFungus(heightmap, pos.x, pos.y)) continue;
      world.destroyEntity(entity);
      onImpact({ position: pos, type: "houseBurned" });
    }

    for (const entity of world.query(Walker, Position)) {
      const pos = world.get(entity, Position)!;
      if (!isFungus(heightmap, pos.x, pos.y)) continue;
      world.destroyEntity(entity);
      onImpact({ position: pos, type: "drowned" });
    }
  };
}
