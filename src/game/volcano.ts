import type { World } from "../ecs";
import { resistsSchool } from "./miracleSchools";
import { House, Position, Walker } from "./components";

/**
 * Destroys every house and walker standing on ground the eruption covered
 * — the cone itself and everything the lava reached. Call this once,
 * alongside `applyVolcano` on the heightmap, passing the vertices that
 * returned; it isn't a per-tick system.
 *
 * Takes the covered vertices rather than a centre and radius. It used to
 * recompute a square footprint from the radius, which worked only while
 * the eruption *was* that square. Lava runs downhill now
 * (docs/original-miracles.md #24), so its footprint is a long irregular
 * tongue that no radius describes — and a mismatch here is not cosmetic:
 * it leaves a settled house sitting on unbuildable rock, or kills someone
 * standing on clean ground.
 *
 * Positions are matched by their nearest vertex, the same rounding
 * heightmap.ts's own `isRock` uses to sample rockHardness, so "this
 * position reads as rock" and "this position was destroyed" cannot
 * disagree.
 */
export function eruptVolcano(world: World, covered: readonly { x: number; y: number }[]): void {
  const buried = new Set(covered.map(({ x, y }) => `${x},${y}`));
  const isBuried = (position: { x: number; y: number }) =>
    buried.has(`${Math.round(position.x)},${Math.round(position.y)}`);

  for (const entity of world.query(Position, House)) {
    if (isBuried(world.get(entity, Position)!)) world.destroyEntity(entity);
  }

  for (const entity of world.query(Position, Walker)) {
    // 火山は火の神技なので「※アキレス以外」——溶岩の上を歩いて焼死する
    // のは他の全員である。see miracleSchools.ts's resistsSchool.
    if (resistsSchool(world.get(entity, Walker)!.state, "fire")) continue;
    if (isBuried(world.get(entity, Position)!)) world.destroyEntity(entity);
  }
}
