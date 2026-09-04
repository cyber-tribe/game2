import type { System } from "../../ecs";
import { findLeastFlatVertex, isTerrainEditAllowed, raiseVertex, type Heightmap, type TerrainEditRule } from "../../world/heightmap";
import { HOUSE_UPGRADE_FLATNESS_RADIUS, TERRAIN_EDIT_MANA_COST } from "../constants";
import { House, Owner, Position, type FactionId } from "../components";
import { trySpendMana } from "../faction";

export interface EnemyTerraformConfig {
  factionId: FactionId;
  heightmap: Heightmap;
  /** Seconds between terraform passes over the faction's houses. */
  decisionInterval: number;
  /** How far around each house to look for land to flatten. */
  radius: number;
  /** Same per-match restriction the player's own taps are gated by — see world/heightmap.ts. */
  terrainEditRule: TerrainEditRule;
}

/**
 * Gives the enemy the same basic "flatten the land around my own house"
 * agency a player has by tapping — instead of just inheriting however flat
 * the terrain happened to generate. Per docs/game-system.md, "敵の神は
 * プレイヤーと同じルールで介入する": without this, the enemy never
 * actually plays the core terraforming loop, it only benefits passively
 * from whatever flatness createHeightmap's terrain happened to produce.
 *
 * Every decisionInterval seconds, each of the faction's houses gets one
 * terrain edit — its single least-flat neighboring vertex, nudged one
 * step toward matching the house's own elevation — paid for through
 * trySpendMana exactly like a player's tap (createHouseUpgradeSystem then
 * reacts to the result the same way it does to the player's edits).
 * Skipped for a house whose surroundings are already fully flat, once the
 * faction can't afford the edit, or — under a restrictive terrainEditRule
 * — for a vertex whose one flattening step runs the wrong direction (the
 * enemy simply can't flatten that particular vertex this pass, same as the
 * player's own disabled raise/lower button).
 */
export function createEnemyTerraformSystem(config: Partial<EnemyTerraformConfig> = {}): System {
  const factionId = config.factionId ?? "enemy";
  const heightmap = config.heightmap;
  if (!heightmap) return () => {};
  const decisionInterval = config.decisionInterval ?? 5;
  const radius = config.radius ?? HOUSE_UPGRADE_FLATNESS_RADIUS;
  const terrainEditRule = config.terrainEditRule ?? "both";
  let timeSincePass = decisionInterval;

  return (world, deltaSeconds) => {
    timeSincePass += deltaSeconds;
    if (timeSincePass < decisionInterval) return;
    timeSincePass = 0;

    for (const entity of world.query(House, Position, Owner)) {
      if (world.get(entity, Owner)!.faction !== factionId) continue;

      const pos = world.get(entity, Position)!;
      const target = findLeastFlatVertex(heightmap, pos.x, pos.y, radius);
      if (!target) continue;
      if (!isTerrainEditAllowed(terrainEditRule, target.delta)) continue;
      if (!trySpendMana(world, factionId, TERRAIN_EDIT_MANA_COST)) continue;

      raiseVertex(heightmap, target.x, target.y, target.delta);
    }
  };
}
