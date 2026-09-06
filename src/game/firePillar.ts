import type { Entity, World } from "../ecs";
import { FirePillar, Position } from "./components";
import { FIRE_PILLAR_LIFETIME } from "./constants";

/**
 * The 火柱 miracle: a wandering pillar of flame dropped at (x, y) — see the
 * FirePillar component and systems/firePillar.ts.
 *
 * Aimed the same way the earthquake, the tornado and the hurricane are
 * (main.ts): from the caster's own shrine, through the tapped point. It
 * wanders from there, so the heading is a push rather than a path.
 */
export function createFirePillar(
  world: World,
  x: number,
  y: number,
  headingX: number,
  headingY: number,
  lifetime: number = FIRE_PILLAR_LIFETIME,
): Entity {
  const magnitude = Math.hypot(headingX, headingY);
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, FirePillar, {
    remaining: lifetime,
    headingX: magnitude === 0 ? 1 : headingX / magnitude,
    headingY: magnitude === 0 ? 0 : headingY / magnitude,
  });
  return entity;
}
