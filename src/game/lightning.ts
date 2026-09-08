import type { World } from "../ecs";
import { resistsSchool } from "./miracleSchools";
import { scorchGround, type Heightmap } from "../world/heightmap";
import { House, Position, Walker } from "./components";
import { LIGHTNING_BOLTS, LIGHTNING_BOLT_RADIUS, LIGHTNING_SCATTER } from "./constants";
import type { OnImpactEffect } from "./systems/effects";
import { distance, type Point } from "./systems/geometry";

/**
 * The original's 雷 (docs/original-miracles.md #16): 「指定地点周辺へ落雷。
 * 人は死亡、建物は燃焼、地面は荒地化。レベルが上がると威力ではなく命中率が
 * 向上する」.
 *
 * Several bolts scattered around the aim point rather than one on it. That
 * scatter is the miracle's character, not sloppiness: the original's own
 * level rule improves *accuracy* rather than damage, which only makes
 * sense for a miracle that misses. game2 has no miracle levels, so nothing
 * tightens the scatter yet — when they exist, LIGHTNING_SCATTER is what
 * they should move.
 *
 * **アキレス dies to this.** He is immune to fire — 「火が効かず焼死
 * しない」 (#23) — and this kills by the strike itself; the burning it
 * leaves is what happens to the buildings and the ground afterwards. So
 * lightning is the answer to a hero who walks through fire rain, which is
 * exactly the sort of "this miracle is for that one" the original is made
 * of.
 *
 * Returns where the bolts actually landed, so the caller can draw them.
 */
export function strikeLightning(
  world: World,
  heightmap: Heightmap | undefined,
  aim: Point,
  rng: () => number = Math.random,
  onImpact: OnImpactEffect = () => {},
): Point[] {
  const bolts: Point[] = [];

  for (let i = 0; i < LIGHTNING_BOLTS; i++) {
    // Uniform over the disc rather than over (angle, radius): the square
    // root is what keeps the bolts from bunching at the aim point, which
    // would quietly turn the scatter back into a single strike.
    const angle = rng() * Math.PI * 2;
    const reach = Math.sqrt(rng()) * LIGHTNING_SCATTER;
    const at = { x: aim.x + Math.cos(angle) * reach, y: aim.y + Math.sin(angle) * reach };
    bolts.push(at);

    if (heightmap) scorchGround(heightmap, at.x, at.y, LIGHTNING_BOLT_RADIUS);

    for (const entity of world.query(Walker, Position)) {
      // 雷「※オディッセウス除く」 — see miracleSchools.ts's resistsSchool.
      if (resistsSchool(world.get(entity, Walker)!.state, "air")) continue;
      const pos = world.get(entity, Position)!;
      if (distance(at, pos) > LIGHTNING_BOLT_RADIUS) continue;
      world.destroyEntity(entity);
      onImpact({ position: pos, type: "combatDeath" });
    }

    for (const entity of world.query(House, Position)) {
      const pos = world.get(entity, Position)!;
      if (distance(at, pos) > LIGHTNING_BOLT_RADIUS) continue;
      world.destroyEntity(entity);
      onImpact({ position: pos, type: "houseBurned" });
    }
  }

  return bolts;
}
