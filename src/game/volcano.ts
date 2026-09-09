import type { World } from "../ecs";
import { resistsMiracle } from "./protection";
import { House, Position, Walker } from "./components";
import { VOLCANO_FIRE_PILLARS, VOLCANO_FIRE_PILLAR_RING } from "./constants";
import { createFirePillar } from "./firePillar";

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
export function eruptVolcano(
  world: World,
  covered: readonly { x: number; y: number }[],
  center?: { x: number; y: number },
  rng: () => number = Math.random,
): void {
  // The pillars go up *before* anything is destroyed. World hands a
  // destroyed entity's id straight back to the next createEntity (see
  // systems/effects.ts), so raising them afterwards would quietly reuse the
  // id of a house or walker this eruption just buried — and callers that
  // then ask world.isAlive about what they lost get told it survived.
  if (center) raiseFirePillars(world, center, rng);

  const buried = new Set(covered.map(({ x, y }) => `${x},${y}`));
  const isBuried = (position: { x: number; y: number }) =>
    buried.has(`${Math.round(position.x)},${Math.round(position.y)}`);

  for (const entity of world.query(Position, House)) {
    if (isBuried(world.get(entity, Position)!)) world.destroyEntity(entity);
  }

  for (const entity of world.query(Position, Walker)) {
    // 火山は火の神技なので「※アキレス以外」——溶岩の上を歩いて焼死する
    // のは他の全員である。see miracleSchools.ts's resistsSchool.
    if (resistsMiracle(world, entity, "fire")) continue;
    if (isBuried(world.get(entity, Position)!)) world.destroyEntity(entity);
  }
}

/**
 * 原作「火山からは火柱が数本発生する」. A few 火柱 thrown out around the
 * crater, each aimed away from it.
 *
 * This is why an eruption goes on being dangerous after the ground has
 * settled: the cone and the lava are a fixed shape a settlement can be
 * rebuilt around, while the pillars wander into what is left. It is also
 * what makes 火山 read as a fire miracle rather than an expensive
 * 地下巨石.
 *
 * Aimed outward, and started clear of the cone (VOLCANO_FIRE_PILLAR_RING),
 * because a 火柱 climbs toward high ground (see systems/firePillar.ts's
 * uphill bias): one born on the slope would simply walk back up the
 * mountain it came from and burn nothing.
 */
function raiseFirePillars(world: World, center: { x: number; y: number }, rng: () => number): void {
  for (let i = 0; i < VOLCANO_FIRE_PILLARS; i++) {
    // Evenly spaced then jittered, the same way the puddles are placed
    // (see applyVolcano's meltPuddles) — an eruption should never put all
    // of its pillars on one side.
    const angle = ((i + rng()) / VOLCANO_FIRE_PILLARS) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    createFirePillar(
      world,
      center.x + dx * VOLCANO_FIRE_PILLAR_RING,
      center.y + dy * VOLCANO_FIRE_PILLAR_RING,
      dx,
      dy,
    );
  }
}
