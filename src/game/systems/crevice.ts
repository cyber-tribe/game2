import type { System } from "../../ecs";
import { isCrevice, type Heightmap } from "../../world/heightmap";
import { Position, Walker } from "../components";
import type { OnImpactEffect } from "./effects";

export interface CreviceConfig {
  /**
   * The world's terrain. Optional to match the other heightmap-reading
   * systems: several tests build a Simulation without one, and a crevice
   * cannot exist at all without terrain to tear.
   */
  heightmap: Heightmap;
  /** Called once per walker lost down a crevice — see systems/effects.ts. */
  onImpact: OnImpactEffect;
}

/**
 * Kills any walker standing on ground an earthquake has torn open — the
 * original's "亀裂に落ちると死亡し、修復されるまで残る"
 * (docs/original-miracles.md #13).
 *
 * A per-tick system, unlike the one-shot sweep flood.ts does: a crevice
 * persists, so what makes it dangerous is walking into it later, not
 * merely standing there at the moment it opened. That persistence is the
 * whole difference between this and the old earthquake, which churned the
 * ground and then stopped mattering.
 *
 * Heroes die here like anyone else for now. The original gives ヘラクレス
 * (#15) immunity to exactly this, which is a reason to check hero kind
 * here once the six named heroes exist — deliberately not anticipated,
 * since guessing at it now would mean writing a rule for a hero that
 * doesn't exist yet.
 */
export function createCreviceSystem(config: Partial<CreviceConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});
  const heightmap = config.heightmap;

  return (world) => {
    if (!heightmap) return;

    for (const entity of world.query(Walker, Position)) {
      const pos = world.get(entity, Position)!;
      if (!isCrevice(heightmap, pos.x, pos.y)) continue;

      world.destroyEntity(entity);
      onImpact({ position: pos, type: "drowned" });
    }
  };
}
