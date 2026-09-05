import type { System } from "../../ecs";
import { Position, Swamp, Walker } from "../components";
import type { OnImpactEffect } from "./effects";
import { distance } from "./geometry";

export interface SwampConfig {
  /** Called once per walker drowned — see systems/effects.ts. */
  onImpact: OnImpactEffect;
}

/**
 * Any walker within a swamp's radius drowns, heroes included — per
 * docs/game-system.md, "踏み込んだ通常の民は沈んで死ぬ". A knight or
 * guardian steps into the same swamp as anyone else; nothing here
 * special-cases isHeroState (unlike drowning.ts's open-water immunity
 * or houseCaptureSystem's burn/capture split, which stay as they are).
 * Each drowning consumes one unit of the swamp's remainingCapacity;
 * once it hits zero the swamp itself dries up and is removed.
 */
export function createSwampSystem(config: Partial<SwampConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});

  return (world) => {
    for (const swampEntity of world.query(Swamp, Position)) {
      const swampPos = world.get(swampEntity, Position)!;

      for (const walkerEntity of world.query(Walker, Position)) {
        if (!world.isAlive(swampEntity)) break;

        const walkerPos = world.get(walkerEntity, Position)!;
        const swamp = world.get(swampEntity, Swamp)!;
        if (distance(swampPos, walkerPos) > swamp.radius) continue;

        world.destroyEntity(walkerEntity);
        onImpact({ position: walkerPos, type: "drowned" });

        const remainingCapacity = swamp.remainingCapacity - 1;
        if (remainingCapacity <= 0) {
          world.destroyEntity(swampEntity);
        } else {
          world.add(swampEntity, Swamp, { ...swamp, remainingCapacity });
        }
      }
    }
  };
}
