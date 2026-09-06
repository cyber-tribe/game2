import type { System } from "../../ecs";
import { MIN_ELEVATION, type Heightmap } from "../../world/heightmap";
import { FirePillar, House, Position, Walker } from "../components";
import {
  FIRE_PILLAR_RADIUS,
  FIRE_PILLAR_SPEED,
  FIRE_PILLAR_WANDER,
} from "../constants";
import type { OnImpactEffect } from "./effects";
import { distance } from "./geometry";

export interface FirePillarConfig {
  /** The world's terrain — the pillar's lasting damage is entirely to it. */
  heightmap: Heightmap;
  /** Called once per walker burned or house collapsed — see systems/effects.ts. */
  onImpact: OnImpactEffect;
  /** Called after a tick that burned ground, so the caller can redraw. */
  onScorch: () => void;
  /** Randomness for the wander, injectable so tests can steer it. */
  rng: () => number;
}

/**
 * Walks every 火柱 across the map, burning what it touches — the original's
 * 「移動する火柱。ランダムに動き、地面を荒地化し人を焼死させ建物を崩壊
 * させる。固定AoEではなく移動する危険地帯」 (docs/original-miracles.md #21).
 *
 * The counterpart to 竜巻 (#17), and the reason the tornado deliberately
 * leaves buildings alone: the original has one wandering hazard that
 * carries people off and another that burns everything, and collapsing
 * them into one would lose a miracle.
 *
 * What it leaves behind matters more than what it kills. People can be
 * replaced; the strip of dead ground stays unbuildable until a 花 is spent
 * on it, so a pillar walked through a settlement costs its owner the land
 * as well as the houses.
 *
 * **アキレス does not burn** — 「火が効かず焼死しない」
 * (docs/original-miracles.md #23). The same exemption fire rain gives
 * (game/fire.ts): fire is fire, whichever miracle lit it, and a hero who
 * survives one and not the other would just be a rule nobody could
 * remember.
 */
export function createFirePillarSystem(config: Partial<FirePillarConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});
  const onScorch = config.onScorch ?? (() => {});
  const rng = config.rng ?? Math.random;
  const heightmap = config.heightmap;

  return (world, deltaSeconds) => {
    for (const entity of world.query(FirePillar, Position)) {
      const pillar = world.get(entity, FirePillar)!;
      const pos = world.get(entity, Position)!;

      const remaining = pillar.remaining - deltaSeconds;
      if (remaining <= 0) {
        world.destroyEntity(entity);
        continue;
      }

      const wander = (rng() * 2 - 1) * FIRE_PILLAR_WANDER * deltaSeconds;
      const headingX = pillar.headingX - pillar.headingY * wander;
      const headingY = pillar.headingY + pillar.headingX * wander;
      const magnitude = Math.hypot(headingX, headingY) || 1;
      const stepX = headingX / magnitude;
      const stepY = headingY / magnitude;
      const next = {
        x: pos.x + stepX * FIRE_PILLAR_SPEED * deltaSeconds,
        y: pos.y + stepY * FIRE_PILLAR_SPEED * deltaSeconds,
      };

      world.add(entity, Position, next);
      world.add(entity, FirePillar, { remaining, headingX: stepX, headingY: stepY });

      if (heightmap && scorchAround(heightmap, next, FIRE_PILLAR_RADIUS) > 0) onScorch();

      for (const walkerEntity of world.query(Walker, Position)) {
        if (world.get(walkerEntity, Walker)!.state === "achilles") continue;
        const walkerPos = world.get(walkerEntity, Position)!;
        if (distance(next, walkerPos) > FIRE_PILLAR_RADIUS) continue;
        world.destroyEntity(walkerEntity);
        onImpact({ position: walkerPos, type: "combatDeath" });
      }

      for (const houseEntity of world.query(House, Position)) {
        const housePos = world.get(houseEntity, Position)!;
        if (distance(next, housePos) > FIRE_PILLAR_RADIUS) continue;
        world.destroyEntity(houseEntity);
        onImpact({ position: housePos, type: "houseBurned" });
      }
    }
  };
}

/**
 * Burns every land vertex within `radius` of (x, y) barren, returning how
 * many it took. Water is left alone — there is nothing there to burn — and
 * so is ground already dead, so a pillar circling over its own path does
 * not keep reporting damage it already did.
 *
 * Woodland, roads and 毒カビ on the ground it crosses are gone: whatever
 * was growing or laid there burned with it.
 */
function scorchAround(heightmap: Heightmap, center: { x: number; y: number }, radius: number): number {
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  let scorched = 0;

  for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (heightmap.vertices[vy][vx] <= Math.max(MIN_ELEVATION, heightmap.waterLevel)) continue;
      if (heightmap.scorched[vy][vx]) continue;

      heightmap.scorched[vy][vx] = true;
      heightmap.forest[vy][vx] = false;
      heightmap.road[vy][vx] = false;
      heightmap.fungus[vy][vx] = false;
      scorched++;
    }
  }

  return scorched;
}
