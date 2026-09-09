import type { System } from "../../ecs";
import { Quake } from "../components";

/**
 * Runs down every 地震's shaking and clears it when it stops — the other
 * half of game/quake.ts's isGroundShaking.
 *
 * Nothing else happens here on purpose. The damage a quake does (the
 * fissure, the walkers who fall in, the swamps that collapse) is all done
 * at the moment of the cast; what is left to tick is only how long the
 * spade stays denied.
 */
export function createQuakeSystem(): System {
  return (world, deltaSeconds) => {
    for (const entity of world.query(Quake)) {
      const quake = world.get(entity, Quake)!;
      quake.remaining -= deltaSeconds;
      if (quake.remaining <= 0) world.destroyEntity(entity);
    }
  };
}
