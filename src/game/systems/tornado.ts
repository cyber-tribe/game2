import type { System } from "../../ecs";
import { resistsMiracle } from "../protection";
import { isInWaterPool, type Heightmap } from "../../world/heightmap";
import { House, Position, Tornado, Walker } from "../components";
import {
  TORNADO_DAMAGE_PER_SECOND,
  TORNADO_DRAG_SPEED,
  TORNADO_RADIUS,
  TORNADO_SPEED,
  TORNADO_WANDER,
  TORNADO_WHIRLPOOL_INTERVAL,
} from "../constants";
import { createWhirlpool } from "../tornado";
import type { OnImpactEffect } from "./effects";
import { distance } from "./geometry";

export interface TornadoConfig {
  /** The world's terrain — without one a tornado can never find water, so it simply expires. */
  heightmap: Heightmap;
  /** Called once per walker torn apart, or house thrown down, inside one — see systems/effects.ts. */
  onImpact: OnImpactEffect;
  /** Randomness for the wander, injectable so tests can steer it. */
  rng: () => number;
}

/**
 * Drifts every 竜巻, wrecks what it passes over, and sheds 渦巻き while it
 * crosses open water — the original's 「一定時間、ランダムに動き回って
 * **建物を吹き飛ばし**、信者を巻き込む。海上では渦巻きを大量発生させる」.
 *
 * Three things in one system because they are one behaviour: a tornado
 * that did not move would be a swamp, one that did not carry would be a
 * slow fire, and one that stopped at the shore would be half a miracle.
 *
 * **It takes houses as well as people.** This used to skip buildings
 * outright, on the reading that the tornado's damage was "entirely in terms
 * of people". The original article puts buildings first in the sentence —
 * 建物を吹き飛ばし、信者を巻き込む — so the omission was reading a summary
 * where the source was more specific. It matters: a wandering hazard that
 * cannot touch a settlement is only ever an anti-army weapon, and the
 * original's tornado is the one miracle you send *into a town*.
 *
 * ハリケーン (#20) also flattens buildings, and the two stay distinct for
 * the reason the original gives them separately: a hurricane is aimed and
 * over in one gust, a tornado wanders for a while and cannot be aimed at
 * all. Same damage, opposite kind of decision.
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

      const remaining = tornado.remaining - deltaSeconds;
      if (remaining <= 0) {
        world.destroyEntity(entity);
        continue;
      }

      // 「海上では渦巻きを大量発生させる」 — the interaction both miracles
      // exist for. Checked against a genuine body of water (the same test
      // drowning.ts uses), not a single half-submerged shoreline tile: a
      // tornado grazing a puddle should not become a sea hazard.
      //
      // The tornado is *not* consumed by the first one. game2 used to
      // destroy it and leave a single 渦巻き behind, which made the
      // original's stated tactic — 「敵陣の海岸付近に大量に仕掛けると土地を
      // 広げにくくなるので効果的」 — impossible to play: one cast bought one
      // whirlpool, so "大量" could only ever mean "cast it many times".
      // It keeps crossing the water for the rest of its 一定時間, shedding
      // one every TORNADO_WHIRLPOOL_INTERVAL.
      const atSea = heightmap !== undefined && isInWaterPool(heightmap, next.x, next.y);
      // Only counts up at sea: a tornado that spent a while over land does
      // not arrive at the coast owing a backlog of whirlpools.
      let sinceWhirlpool = atSea ? tornado.sinceWhirlpool + deltaSeconds : tornado.sinceWhirlpool;
      if (atSea && sinceWhirlpool >= TORNADO_WHIRLPOOL_INTERVAL) {
        sinceWhirlpool = 0;
        createWhirlpool(world, next.x, next.y, stepX, stepY);
      }

      world.add(entity, Position, next);
      world.add(entity, Tornado, { remaining, headingX: stepX, headingY: stepY, sinceWhirlpool });

      // Nothing to drag or wreck out at sea — walkers there are
      // drowning.ts's business and no house stands on water — and the loops
      // below are the expensive part of this system.
      if (atSea) continue;

      // 「建物を吹き飛ばし」 — thrown down outright rather than worn away.
      // A house has no strength to grind against the way a walker does, and
      // the original gives the tornado no lingering effect on one: it goes.
      for (const houseEntity of world.query(House, Position)) {
        const housePos = world.get(houseEntity, Position)!;
        if (distance(next, housePos) > TORNADO_RADIUS) continue;

        world.destroyEntity(houseEntity);
        onImpact({ position: housePos, type: "blown" });
      }

      for (const walkerEntity of world.query(Walker, Position)) {
        // 竜巻「※オディッセウス除く」 — see miracleSchools.ts's resistsSchool.
        if (resistsMiracle(world, walkerEntity, "air")) continue;
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
