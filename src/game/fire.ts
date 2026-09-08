import type { World } from "../ecs";
import { resistsSchool } from "./miracleSchools";
import { House, Position, Walker } from "./components";
import type { OnImpactEffect } from "./systems/effects";

/**
 * Destroys every house and walker standing on ground that burned. Call
 * this once, alongside `applyFireRain` on the heightmap, passing the
 * vertices it returned; it isn't a per-tick system.
 *
 * Takes the burned vertices rather than a centre and radius for the same
 * reason eruptVolcano does: fire spreads through woodland
 * (docs/original-miracles.md's 森 -> 火の雨), so what actually burned is
 * an irregular region no radius describes.
 */
export function burnFire(
  world: World,
  burned: readonly { x: number; y: number }[],
  onImpact: OnImpactEffect = () => {},
): void {
  const scorched = new Set(burned.map(({ x, y }) => `${x},${y}`));
  const isScorched = (position: { x: number; y: number }) =>
    scorched.has(`${Math.round(position.x)},${Math.round(position.y)}`);

  for (const entity of world.query(Position, House)) {
    const pos = world.get(entity, Position)!;
    if (!isScorched(pos)) continue;
    world.destroyEntity(entity);
    onImpact({ position: pos, type: "houseBurned" });
  }

  for (const entity of world.query(Position, Walker)) {
    // 火の雨「※アキレス除く」 — the other half of fire rain, and the reason
    // a hero is worth casting *before* an enemy answers your forest with a
    // torch. Houses have no such exemption: the hero survives, what they
    // were defending does not. 「同じカテゴリーの攻撃神技は効果がない」 — see miracleSchools.ts's resistsSchool.
    if (resistsSchool(world.get(entity, Walker)!.state, "fire")) continue;

    const pos = world.get(entity, Position)!;
    if (!isScorched(pos)) continue;
    world.destroyEntity(entity);
    onImpact({ position: pos, type: "combatDeath" });
  }
}
