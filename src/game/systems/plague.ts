import type { System } from "../../ecs";
import { House, Infected, Position, Walker } from "../components";
import { PLAGUE_DURATION, PLAGUE_SPREAD_CHANCE, PLAGUE_SPREAD_RADIUS } from "../constants";
import { distance } from "./geometry";

export interface PlagueConfig {
  /** Randomness for the spread, injectable so tests can steer it. */
  rng: () => number;
}

/**
 * Spreads 病原菌 from whoever has it and lets them recover — the original's
 * 「信者を感染させ周囲へ広げる……即死ではなく国力を長期的に削る」
 * (docs/original-miracles.md #4).
 *
 * What being infected actually costs lives where each cost belongs: an
 * infected house earns no mana (systems/mana.ts) and an infected walker
 * does not answer the final battle (armageddon.ts). Nothing here hurts
 * anybody — this system only decides who has it.
 *
 * Both directions of contact count: a sick walker infects the house it
 * passes and a sick house infects the walkers who come home to it, which
 * is why a settlement that catches this keeps re-infecting itself for a
 * while rather than clearing in one pass.
 *
 * Recovery is a countdown per carrier, not a global timer, so a plague
 * that keeps finding new hosts outlives its first ones — and one that runs
 * out of neighbours dies with them.
 */
export function createPlagueSystem(config: Partial<PlagueConfig> = {}): System {
  const rng = config.rng ?? Math.random;

  return (world, deltaSeconds) => {
    const carriers = world.query(Infected, Position).map((entity) => ({
      entity,
      position: world.get(entity, Position)!,
    }));
    if (carriers.length === 0) return;

    // Decided against the state at the start of the tick: someone infected
    // this tick should not immediately pass it on in the same tick, or one
    // crowded settlement would go from one case to all of them at once.
    const candidates = [...world.query(Walker, Position), ...world.query(House, Position)].filter(
      (entity) => !world.has(entity, Infected),
    );

    for (const candidate of candidates) {
      const pos = world.get(candidate, Position)!;
      for (const carrier of carriers) {
        if (distance(carrier.position, pos) > PLAGUE_SPREAD_RADIUS) continue;
        if (rng() >= PLAGUE_SPREAD_CHANCE * deltaSeconds) continue;
        world.add(candidate, Infected, { remaining: PLAGUE_DURATION });
        break;
      }
    }

    for (const { entity } of carriers) {
      if (!world.isAlive(entity)) continue;
      const remaining = world.get(entity, Infected)!.remaining - deltaSeconds;
      if (remaining <= 0) world.remove(entity, Infected);
      else world.add(entity, Infected, { remaining });
    }
  };
}
