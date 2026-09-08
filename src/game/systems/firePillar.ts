import type { System } from "../../ecs";
import { sampleElevation, scorchGround, type Heightmap } from "../../world/heightmap";
import { FirePillar, House, Position, Walker } from "../components";
import {
  FIRE_PILLAR_RADIUS,
  FIRE_PILLAR_SPEED,
  FIRE_PILLAR_UPHILL_BIAS, FIRE_PILLAR_WANDER,
} from "../constants";
import { resistsMiracle } from "../protection";
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
/**
 * A unit vector pointing up the local slope, or zero on level ground —
 * sampled from the four neighbouring tiles rather than from the vertex grid
 * so it reads the same hill the pillar is standing on.
 */
function uphillDirection(heightmap: Heightmap, x: number, y: number): { x: number; y: number } {
  const east = sampleElevation(heightmap, x + 1, y);
  const west = sampleElevation(heightmap, x - 1, y);
  const south = sampleElevation(heightmap, x, y + 1);
  const north = sampleElevation(heightmap, x, y - 1);

  const gradientX = east - west;
  const gradientY = south - north;
  const magnitude = Math.hypot(gradientX, gradientY);
  if (magnitude === 0) return { x: 0, y: 0 };
  return { x: gradientX / magnitude, y: gradientY / magnitude };
}

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
      // 「移動方向はランダムだが、段差があると高い方へ動きやすい傾向がある」.
      // The wander turns it; the slope leans it. On level ground the lean is
      // zero and this is exactly the old random walk.
      const uphill = heightmap ? uphillDirection(heightmap, pos.x, pos.y) : { x: 0, y: 0 };
      const headingX = pillar.headingX - pillar.headingY * wander + uphill.x * FIRE_PILLAR_UPHILL_BIAS;
      const headingY = pillar.headingY + pillar.headingX * wander + uphill.y * FIRE_PILLAR_UPHILL_BIAS;
      const magnitude = Math.hypot(headingX, headingY) || 1;
      const stepX = headingX / magnitude;
      const stepY = headingY / magnitude;
      const next = {
        x: pos.x + stepX * FIRE_PILLAR_SPEED * deltaSeconds,
        y: pos.y + stepY * FIRE_PILLAR_SPEED * deltaSeconds,
      };

      // 「Ｌ＋Ｂ(3×3土地下げ)等で水中に落とすと消火できる」 — the one answer
      // the player has to a pillar already burning, and the reason 沈降 is
      // worth reaching for mid-disaster. Checked after the step, so digging
      // a channel in front of one puts it out when it walks in.
      if (heightmap && sampleElevation(heightmap, next.x, next.y) <= heightmap.waterLevel) {
        world.destroyEntity(entity);
        continue;
      }

      world.add(entity, Position, next);
      world.add(entity, FirePillar, { remaining, headingX: stepX, headingY: stepY });

      if (heightmap && scorchGround(heightmap, next.x, next.y, FIRE_PILLAR_RADIUS).length > 0) onScorch();

      for (const walkerEntity of world.query(Walker, Position)) {
        // 火柱「※アキレス除く」 — 「同じカテゴリーの攻撃神技は効果がない」 — see miracleSchools.ts's resistsSchool.
        if (resistsMiracle(world, walkerEntity, "fire")) continue;
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
