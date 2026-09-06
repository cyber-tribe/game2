import type { System } from "../../ecs";
import { scorchGround, type Heightmap } from "../../world/heightmap";
import { House, Position, Storm } from "../components";
import { LIGHTNING_BOLT_RADIUS, STORM_RADIUS, STORM_STRIKE_INTERVAL } from "../constants";
import type { OnImpactEffect } from "./effects";
import { distance } from "./geometry";

export interface StormConfig {
  /** The world's terrain — a storm's lasting damage is to the ground. */
  heightmap: Heightmap;
  /** Called once per house destroyed — see systems/effects.ts. */
  onImpact: OnImpactEffect;
  /** Called after a strike that burned ground, so the caller can redraw. */
  onScorch: () => void;
  /** Randomness for where each bolt lands, injectable so tests can steer it. */
  rng: () => number;
}

/**
 * Keeps every 嵐's cloud striking the ground under it — the original's
 * 「雷雲を発生させ周辺へ継続的に落雷。単発の雷と違い範囲持続型。この雷は
 * 人には直接当たらない」 (docs/original-miracles.md #18).
 *
 * **Its lightning does not touch people.** That is the original's own
 * distinction between this and 雷 (#16), and it is what gives the pair two
 * different jobs rather than two sizes of the same one: 雷 is how you kill
 * something, 嵐 is how you make a place unusable. A storm that also killed
 * would simply be the better of the two, and the cheaper one would never
 * be cast again.
 *
 * Buildings and ground are fair game, so a storm parked over a settlement
 * flattens it and leaves the land barren behind it — the houses are gone,
 * the people who lived in them are scattered but alive, and nobody can
 * rebuild there until a 花 is spent.
 */
export function createStormSystem(config: Partial<StormConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});
  const onScorch = config.onScorch ?? (() => {});
  const rng = config.rng ?? Math.random;
  const heightmap = config.heightmap;

  return (world, deltaSeconds) => {
    for (const entity of world.query(Storm, Position)) {
      const storm = world.get(entity, Storm)!;
      const pos = world.get(entity, Position)!;

      const remaining = storm.remaining - deltaSeconds;
      if (remaining <= 0) {
        world.destroyEntity(entity);
        continue;
      }

      let untilStrike = storm.untilStrike - deltaSeconds;
      if (untilStrike > 0) {
        world.add(entity, Storm, { remaining, untilStrike });
        continue;
      }
      untilStrike = STORM_STRIKE_INTERVAL;
      world.add(entity, Storm, { remaining, untilStrike });

      const angle = rng() * Math.PI * 2;
      const reach = Math.sqrt(rng()) * STORM_RADIUS;
      const at = { x: pos.x + Math.cos(angle) * reach, y: pos.y + Math.sin(angle) * reach };

      if (heightmap && scorchGround(heightmap, at.x, at.y, LIGHTNING_BOLT_RADIUS).length > 0) onScorch();

      for (const houseEntity of world.query(House, Position)) {
        const housePos = world.get(houseEntity, Position)!;
        if (distance(at, housePos) > LIGHTNING_BOLT_RADIUS) continue;
        world.destroyEntity(houseEntity);
        onImpact({ position: housePos, type: "houseBurned" });
      }
    }
  };
}
