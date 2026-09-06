import type { System } from "../../ecs";
import { MIN_ELEVATION, isInWaterPool, type Heightmap } from "../../world/heightmap";
import { House, Position, Walker, Whirlpool } from "../components";
import { WHIRLPOOL_RADIUS, WHIRLPOOL_SPEED, WHIRLPOOL_SPLIT_INTERVAL } from "../constants";
import { createWhirlpool } from "../tornado";
import type { OnImpactEffect } from "./effects";
import { distance } from "./geometry";

export interface WhirlpoolConfig {
  /** The world's terrain — a whirlpool is nothing but its effect on it. */
  heightmap: Heightmap;
  /** Called once per walker or house lost to the sea — see systems/effects.ts. */
  onImpact: OnImpactEffect;
  /** Called after a tick that changed the terrain, so the caller can redraw. */
  onErode: () => void;
  /** Randomness for the wander, injectable so tests can steer it. */
  rng: () => number;
}

/**
 * Moves every 渦巻き across the water, eats the coast it touches, and lets
 * it split — the original's 「海上を移動しながら陸地を削って水へ戻す。
 * 一定時間で分裂して被害範囲が広がる」 (docs/original-miracles.md #26).
 *
 * Eroding and moving are the same act here, deliberately. A whirlpool that
 * reaches land does not stop and does not walk onto it: it grinds that
 * ground down to sea level and moves in next tick, over what is now water.
 * So it eats a coastline inward rather than bouncing along it, and the
 * shape it leaves behind is a bite rather than a scrape — which is what
 * 「陸地を削って水へ戻す」 describes and, incidentally, the only thing on
 * the map that can *undo* land.
 *
 * Anything standing on the ground it takes goes with it. A house drowned
 * this way is reported as "drowned" rather than burned: the sea took it,
 * nothing was set alight.
 */
export function createWhirlpoolSystem(config: Partial<WhirlpoolConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});
  const onErode = config.onErode ?? (() => {});
  const rng = config.rng ?? Math.random;
  const heightmap = config.heightmap;

  return (world, deltaSeconds) => {
    if (!heightmap) return;

    for (const entity of world.query(Whirlpool, Position)) {
      const whirlpool = world.get(entity, Whirlpool)!;
      const pos = world.get(entity, Position)!;

      const remaining = whirlpool.remaining - deltaSeconds;
      if (remaining <= 0) {
        world.destroyEntity(entity);
        continue;
      }

      const wander = (rng() * 2 - 1) * deltaSeconds;
      const headingX = whirlpool.headingX - whirlpool.headingY * wander;
      const headingY = whirlpool.headingY + whirlpool.headingX * wander;
      const magnitude = Math.hypot(headingX, headingY) || 1;
      const stepX = headingX / magnitude;
      const stepY = headingY / magnitude;
      const next = {
        x: pos.x + stepX * WHIRLPOOL_SPEED * deltaSeconds,
        y: pos.y + stepY * WHIRLPOOL_SPEED * deltaSeconds,
      };

      // It always chews at where it *wants* to go, and only moves there if
      // that is already water. So a whirlpool meeting a coast spends a tick
      // turning it into sea and then moves into it — biting inward rather
      // than sliding along the shore.
      const canMove = isInWaterPool(heightmap, next.x, next.y);
      const position = canMove ? next : pos;
      if (erodeAround(heightmap, next, WHIRLPOOL_RADIUS) > 0) onErode();

      let untilSplit = whirlpool.untilSplit - deltaSeconds;
      let splitsLeft = whirlpool.splitsLeft;
      if (untilSplit <= 0 && splitsLeft > 0) {
        untilSplit = WHIRLPOOL_SPLIT_INTERVAL;
        splitsLeft -= 1;
        // The child takes the opposite heading, so a split widens the
        // damage instead of doubling it in place — "被害範囲が広がる".
        createWhirlpool(world, position.x, position.y, -stepX, -stepY, splitsLeft, remaining);
      } else if (untilSplit <= 0) {
        untilSplit = WHIRLPOOL_SPLIT_INTERVAL;
      }

      world.add(entity, Position, position);
      world.add(entity, Whirlpool, { remaining, untilSplit, splitsLeft, headingX: stepX, headingY: stepY });

      for (const walkerEntity of world.query(Walker, Position)) {
        const walkerPos = world.get(walkerEntity, Position)!;
        if (distance(position, walkerPos) > WHIRLPOOL_RADIUS) continue;
        world.destroyEntity(walkerEntity);
        onImpact({ position: walkerPos, type: "drowned" });
      }

      for (const houseEntity of world.query(House, Position)) {
        const housePos = world.get(houseEntity, Position)!;
        if (distance(position, housePos) > WHIRLPOOL_RADIUS) continue;
        world.destroyEntity(houseEntity);
        onImpact({ position: housePos, type: "drowned" });
      }
    }
  };
}

/**
 * Grinds every land vertex within `radius` of (x, y) down to sea level,
 * returning how many it took. Rock included: the sea does not care how
 * hard a volcano made the ground, and land that survived a whirlpool
 * because a volcano had covered it would be a strange rule to explain.
 */
function erodeAround(heightmap: Heightmap, center: { x: number; y: number }, radius: number): number {
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  let eroded = 0;

  for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (heightmap.vertices[vy][vx] <= heightmap.waterLevel) continue;

      heightmap.vertices[vy][vx] = Math.max(MIN_ELEVATION, heightmap.waterLevel);
      heightmap.rockHardness[vy][vx] = 0;
      heightmap.forest[vy][vx] = false;
      heightmap.road[vy][vx] = false;
      heightmap.fungus[vy][vx] = false;
      eroded++;
    }
  }

  return eroded;
}
