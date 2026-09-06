import type { System } from "../../ecs";
import { isInWaterPool, type Heightmap } from "../../world/heightmap";
import { Position, Tornado, Walker } from "../components";
import {
  TORNADO_DAMAGE_PER_SECOND,
  TORNADO_DRAG_SPEED,
  TORNADO_RADIUS,
  TORNADO_SPEED,
  TORNADO_WANDER,
} from "../constants";
import { createWhirlpool } from "../tornado";
import type { OnImpactEffect } from "./effects";
import { distance } from "./geometry";

export interface TornadoConfig {
  /** The world's terrain — without one a tornado can never find water, so it simply expires. */
  heightmap: Heightmap;
  /** Called once per walker torn apart inside one — see systems/effects.ts. */
  onImpact: OnImpactEffect;
  /** Randomness for the wander, injectable so tests can steer it. */
  rng: () => number;
}

/**
 * Drifts every 竜巻, drags and grinds down whoever it catches, and turns it
 * into a 渦巻き the moment it reaches water — the original's
 * 「一定時間ランダムに移動し被害を与える。信者を巻き込んで運び体力を減らす。
 * 水地形へ入ると渦巻きへ変化する」 (docs/original-miracles.md #17).
 *
 * Three things in one system because they are one behaviour: a tornado
 * that did not move would be a swamp, one that did not carry would be a
 * slow fire, and one that stopped at the shore would be half a miracle.
 *
 * **It does not touch houses.** The original describes the tornado's
 * damage entirely in terms of people ("信者を巻き込んで運び"); the miracle
 * that flattens buildings is 火柱 (#21), which is not implemented yet.
 * Adding building damage here would quietly merge two of the original's
 * miracles into one.
 *
 * A caught walker is dragged toward the centre while it is ground down, so
 * escaping means outrunning the drag rather than simply being missed —
 * which is why the damage is per-second rather than on contact.
 */
export function createTornadoSystem(config: Partial<TornadoConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});
  const rng = config.rng ?? Math.random;
  const heightmap = config.heightmap;

  return (world, deltaSeconds) => {
    for (const entity of world.query(Tornado, Position)) {
      const tornado = world.get(entity, Tornado)!;
      const pos = world.get(entity, Position)!;

      // Perpendicular wander, so the funnel curves off its heading without
      // ever doubling back along it — the same shape applyEarthquake uses
      // for its fissure, and for the same reason: a path, not a jitter.
      const wander = (rng() * 2 - 1) * TORNADO_WANDER * deltaSeconds;
      const headingX = tornado.headingX - tornado.headingY * wander;
      const headingY = tornado.headingY + tornado.headingX * wander;
      const magnitude = Math.hypot(headingX, headingY) || 1;
      const stepX = headingX / magnitude;
      const stepY = headingY / magnitude;

      const next = {
        x: pos.x + stepX * TORNADO_SPEED * deltaSeconds,
        y: pos.y + stepY * TORNADO_SPEED * deltaSeconds,
      };

      // 水地形へ入ると渦巻きへ変化する — the interaction both miracles
      // exist for. Checked against a genuine body of water (the same test
      // drowning.ts uses), not a single half-submerged shoreline tile: a
      // tornado grazing a puddle should not become a sea hazard.
      if (heightmap && isInWaterPool(heightmap, next.x, next.y)) {
        world.destroyEntity(entity);
        createWhirlpool(world, next.x, next.y, stepX, stepY);
        continue;
      }

      const remaining = tornado.remaining - deltaSeconds;
      if (remaining <= 0) {
        world.destroyEntity(entity);
        continue;
      }

      world.add(entity, Position, next);
      world.add(entity, Tornado, { remaining, headingX: stepX, headingY: stepY });

      for (const walkerEntity of world.query(Walker, Position)) {
        const walkerPos = world.get(walkerEntity, Position)!;
        if (distance(next, walkerPos) > TORNADO_RADIUS) continue;

        const walker = world.get(walkerEntity, Walker)!;
        const strength = walker.strength - TORNADO_DAMAGE_PER_SECOND * deltaSeconds;
        if (strength <= 0) {
          world.destroyEntity(walkerEntity);
          onImpact({ position: walkerPos, type: "combatDeath" });
          continue;
        }

        const dx = next.x - walkerPos.x;
        const dy = next.y - walkerPos.y;
        const away = Math.hypot(dx, dy);
        // Clamped so the drag never carries anyone *past* the centre — the
        // same no-overshoot rule movementSystem uses. Without it a walker
        // caught on the near edge is flung out the far side, which reads as
        // being thrown clear rather than pulled in.
        const drag = Math.min(TORNADO_DRAG_SPEED * deltaSeconds, away);
        world.add(walkerEntity, Walker, { ...walker, strength });
        if (away > 0) {
          world.add(walkerEntity, Position, {
            x: walkerPos.x + (dx / away) * drag,
            y: walkerPos.y + (dy / away) * drag,
          });
        }
      }
    }
  };
}
