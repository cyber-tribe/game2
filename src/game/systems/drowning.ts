import type { System } from "../../ecs";
import { isInWaterPool, type Heightmap } from "../../world/heightmap";
import { DROWNING_BREATH_SECONDS } from "../constants";
import { Drowning, Position, Walker, isHeroState } from "../components";
import type { OnImpactEffect } from "./effects";

export interface DrowningConfig {
  heightmap?: Heightmap;
  /** Called once per walker drowned — see systems/effects.ts. */
  onImpact?: OnImpactEffect;
  /**
   * Drowns on first contact instead of the gradual countdown — see
   * WorldDefinition's own doc comment on why some worlds ("海がマグマ"-
   * themed ones, i.e. this codebase's "rock"/溶岩地帯 terrain) make their
   * own water lethal outright.
   */
  instant?: boolean;
}

/**
 * Every walker standing in a genuine body of water (see isInWaterPool — a
 * single half-submerged tile at a shoreline doesn't count) loses breath
 * each tick; reaching 0 drowns it (destroyed, reporting the same "drowned"
 * impact flood.ts's own drownFlood already uses). Reaching dry land again
 * removes the countdown outright — full, instant recovery, per feedback:
 * "基本は溺れてもエネルギーが0になるまでは生きており陸に上がると普段の
 * 動きに戻る". Until this existed, ordinary terrain edits that dug land
 * below sea level had zero consequence for any walker left standing
 * there — this is what actually gives water, not just the dedicated
 * flood/swamp miracles, its own teeth (per docs/game-system.md's own
 * "通常の民は入ると溺れる", never actually wired up for anything but
 * those two miracles until now).
 *
 * Heroes are exempt (isHeroState), same immunity swampSystem already
 * grants them ("騎士は...沼を避ける", extended to every hero kind).
 * Houses aren't covered here — see flood.ts's drownFlood, which still
 * destroys a submerged house outright: a building can't swim to shore, so
 * there's no "gradual" version of that to model.
 */
export function createDrowningSystem(config: DrowningConfig = {}): System {
  const { heightmap, instant = false } = config;
  if (!heightmap) return () => {};
  const onImpact = config.onImpact ?? (() => {});

  return (world, deltaSeconds) => {
    for (const entity of world.query(Walker, Position)) {
      if (isHeroState(world.get(entity, Walker)!.state)) continue;

      const pos = world.get(entity, Position)!;
      const drowning = world.get(entity, Drowning);

      if (!isInWaterPool(heightmap, pos.x, pos.y)) {
        if (drowning) world.remove(entity, Drowning);
        continue;
      }

      const remainingBreath = (drowning?.breath ?? DROWNING_BREATH_SECONDS) - deltaSeconds;
      if (instant || remainingBreath <= 0) {
        world.destroyEntity(entity);
        onImpact({ position: pos, type: "drowned" });
      } else {
        world.add(entity, Drowning, { breath: remainingBreath });
      }
    }
  };
}
