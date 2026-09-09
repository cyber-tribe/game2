import type { System } from "../../ecs";
import { resumeLava, type Heightmap } from "../../world/heightmap";
import { LavaFlow } from "../components";
import { eruptVolcano } from "../volcano";

export interface LavaFlowConfig {
  heightmap: Heightmap;
  /** Called when lava actually moved, so the caller can redraw the ground it took. */
  onFlow: () => void;
}

/**
 * Watches every waiting lava flow for its shoreline to be filled in, and
 * lets it through when it is — 原作「溶岩は水地形で止まる。**水を埋め立てる
 * とさらに外側へ流れ出す**」.
 *
 * This is what makes 火山 a lasting threat rather than a shape. The crater
 * is over in an instant and the flow around it looks settled, but it is
 * still leaning on the channel between it and your village — and the spade
 * you would reach for to widen that shoreline is exactly what opens the
 * door. There is no undo: 花 clears the rock behind the flow, and never the
 * flow's patience.
 *
 * It runs on every tick and costs almost nothing while nothing changes: a
 * waiting flow only re-reads the handful of vertices it stopped against.
 * Cheap enough that it does not need an interval, and an interval would
 * mean the lava arriving a beat after the spade rather than with it.
 */
export function createLavaFlowSystem(config: Partial<LavaFlowConfig> = {}): System {
  const heightmap = config.heightmap;
  if (!heightmap) return () => {};
  const onFlow = config.onFlow ?? (() => {});

  return (world) => {
    for (const entity of world.query(LavaFlow)) {
      const waiting = world.get(entity, LavaFlow)!;
      const flowed = resumeLava(heightmap, {
        blocked: [...waiting.blocked],
        remaining: waiting.remaining,
        hardness: waiting.hardness,
      });

      if (flowed.covered.length === 0) continue;

      // Whatever stood on the ground it just took goes the same way it
      // would have during the eruption itself. No crater, so no 火柱: those
      // belong to the eruption, and this is the same eruption still
      // arriving.
      eruptVolcano(world, flowed.covered);

      if (flowed.stalled) {
        world.add(entity, LavaFlow, {
          blocked: flowed.stalled.blocked,
          remaining: flowed.stalled.remaining,
          hardness: flowed.stalled.hardness,
        });
      } else {
        // Spent, or through to open ground with nothing left to wait for.
        world.destroyEntity(entity);
      }

      onFlow();
    }
  };
}
