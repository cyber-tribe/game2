import type { System, World } from "../../ecs";
import { applyEarthquake, type Heightmap } from "../../world/heightmap";
import { triggerArmageddon } from "../armageddon";
import { FactionState, House, Owner, Position, Walker, type FactionId } from "../components";
import { ARMAGEDDON_MANA_COST, ARMAGEDDON_POPULATION_RATIO, EARTHQUAKE_MANA_COST, KNIGHT_MANA_COST } from "../constants";
import { findFactionEntity, trySpendMana } from "../faction";
import { knightify } from "../knight";
import type { Point } from "./geometry";

export interface EnemyMiracleConfig {
  factionId: FactionId;
  opponentId: FactionId;
  heightmap: Heightmap;
  worldCenter: Point;
  /** Seconds between re-evaluating whether to cast something. */
  decisionInterval: number;
  /** Injectable RNG, in [0, 1), for deterministic tests. */
  rng: () => number;
}

/**
 * Gives the enemy the same "god" toolkit the player has — not just
 * terraforming (see enemyTerraform.ts) but the miracles that actually
 * pressure the other side. Without this, only the player is a real god;
 * the enemy is just an RTS AI that happens to share the same building
 * rules. Every decisionInterval seconds, in priority order:
 *
 * 1. Population lead of ARMAGEDDON_POPULATION_RATIO or more over the
 *    opponent → go for the win with 最終決戦, per docs/game-system.md's
 *    "人口で明確に勝っているときの「決着ボタン」".
 * 2. Already aggressive (behaviorMode "fight") with a leader who isn't a
 *    knight yet → knight them, turning the leader into a self-sufficient
 *    attacker.
 * 3. Otherwise, if it can afford it, shakes up a random opponent house
 *    with an earthquake — economic sabotage rather than pure combat.
 *
 * Each branch spends mana through trySpendMana exactly like a player's
 * tap, so an enemy that can't afford a step simply falls through to a
 * cheaper one (or does nothing) rather than acting for free. Skips
 * everything once finalBattle is set, same as createEnemyAiSystem.
 */
export function createEnemyMiracleSystem(config: Partial<EnemyMiracleConfig> = {}): System {
  const factionId = config.factionId ?? "enemy";
  const opponentId = config.opponentId ?? "player";
  const heightmap = config.heightmap;
  const worldCenter = config.worldCenter;
  if (!heightmap || !worldCenter) return () => {};
  const decisionInterval = config.decisionInterval ?? 8;
  const rng = config.rng ?? Math.random;
  let timeSincePass = decisionInterval;

  return (world, deltaSeconds) => {
    timeSincePass += deltaSeconds;
    if (timeSincePass < decisionInterval) return;
    timeSincePass = 0;

    const factionEntity = findFactionEntity(world, factionId);
    if (factionEntity === undefined) return;
    const state = world.get(factionEntity, FactionState)!;
    if (state.finalBattle) return;

    const myPopulation = totalPopulation(world, factionId);
    const theirPopulation = totalPopulation(world, opponentId);

    if (theirPopulation > 0 && myPopulation >= theirPopulation * ARMAGEDDON_POPULATION_RATIO) {
      if (trySpendMana(world, factionId, ARMAGEDDON_MANA_COST)) {
        triggerArmageddon(world, worldCenter);
        return;
      }
    }

    if (state.behaviorMode === "fight" && state.leaderId !== undefined && world.isAlive(state.leaderId)) {
      const leader = world.get(state.leaderId, Walker);
      if (leader && leader.state !== "knight" && trySpendMana(world, factionId, KNIGHT_MANA_COST)) {
        knightify(world, factionId);
        return;
      }
    }

    const target = randomOpponentHouse(world, opponentId, rng);
    if (target && trySpendMana(world, factionId, EARTHQUAKE_MANA_COST)) {
      applyEarthquake(heightmap, target.x, target.y, undefined, undefined, rng);
    }
  };
}

function totalPopulation(world: World, faction: FactionId): number {
  let total = 0;
  for (const entity of world.query(House, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) total += world.get(entity, House)!.population;
  }
  for (const entity of world.query(Walker, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) total += 1;
  }
  return total;
}

function randomOpponentHouse(world: World, opponentId: FactionId, rng: () => number): Point | null {
  const positions: Point[] = [];
  for (const entity of world.query(House, Position, Owner)) {
    if (world.get(entity, Owner)!.faction === opponentId) positions.push(world.get(entity, Position)!);
  }
  if (positions.length === 0) return null;
  return positions[Math.floor(rng() * positions.length)];
}
