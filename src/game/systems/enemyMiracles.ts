import type { System, World } from "../../ecs";
import {
  applyEarthquake,
  applyVolcano,
  DEFAULT_EARTHQUAKE_RADIUS,
  DEFAULT_VOLCANO_RADIUS,
  type Heightmap,
} from "../../world/heightmap";
import { triggerArmageddon } from "../armageddon";
import { FactionState, House, Owner, Position, Walker, type FactionId } from "../components";
import {
  ARMAGEDDON_MANA_COST,
  ARMAGEDDON_POPULATION_RATIO,
  EARTHQUAKE_MANA_COST,
  KNIGHT_MANA_COST,
  VOLCANO_MANA_COST,
  VOLCANO_POPULATION_RATIO,
} from "../constants";
import { findFactionEntity, trySpendMana } from "../faction";
import { knightify } from "../knight";
import { eruptVolcano } from "../volcano";
import { distance, type Point } from "./geometry";

/**
 * Reported through EnemyMiracleConfig.onAction whenever the enemy
 * actually casts something (not on a decision pass that affords
 * nothing) — the game-logic side has no idea whether anyone is even
 * looking at the map right now, so it just reports what happened and
 * lets the caller (main.ts) decide how to surface it.
 */
export type EnemyMiracleEvent =
  | { type: "earthquake"; position: Point }
  | { type: "knight" }
  | { type: "armageddon" };

export interface EnemyMiracleConfig {
  factionId: FactionId;
  opponentId: FactionId;
  heightmap: Heightmap;
  worldCenter: Point;
  /** Seconds between re-evaluating whether to cast something. */
  decisionInterval: number;
  /** Injectable RNG, in [0, 1), for deterministic tests. */
  rng: () => number;
  /** Called once per miracle actually cast — see EnemyMiracleEvent. */
  onAction: (event: EnemyMiracleEvent) => void;
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
 * 3. A real but not-yet-decisive population lead (VOLCANO_POPULATION_
 *    RATIO or more) → escalate to a volcano, permanently denying the
 *    opponent's most valuable target rather than just disrupting it.
 * 4. Otherwise, if it can afford it, shakes up the opponent's biggest
 *    house cluster with an earthquake — economic sabotage rather than
 *    pure combat.
 *
 * Both the earthquake and volcano targets are picked by
 * densestOpponentCluster rather than uniformly at random: a real
 * opponent would aim for wherever hits the most houses, not a
 * coin-flip. Each branch spends mana through trySpendMana exactly like
 * a player's tap, so an enemy that can't afford a step simply falls
 * through to a cheaper one (or does nothing) rather than acting for
 * free. Skips everything once finalBattle is set, same as
 * createEnemyAiSystem.
 */
export function createEnemyMiracleSystem(config: Partial<EnemyMiracleConfig> = {}): System {
  const factionId = config.factionId ?? "enemy";
  const opponentId = config.opponentId ?? "player";
  const heightmap = config.heightmap;
  const worldCenter = config.worldCenter;
  if (!heightmap || !worldCenter) return () => {};
  const decisionInterval = config.decisionInterval ?? 8;
  const rng = config.rng ?? Math.random;
  const onAction = config.onAction ?? (() => {});
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
    const populationRatio = theirPopulation > 0 ? myPopulation / theirPopulation : 0;

    if (populationRatio >= ARMAGEDDON_POPULATION_RATIO) {
      if (trySpendMana(world, factionId, ARMAGEDDON_MANA_COST)) {
        triggerArmageddon(world, worldCenter);
        onAction({ type: "armageddon" });
        return;
      }
    }

    if (state.behaviorMode === "fight" && state.leaderId !== undefined && world.isAlive(state.leaderId)) {
      const leader = world.get(state.leaderId, Walker);
      if (leader && leader.state !== "knight" && trySpendMana(world, factionId, KNIGHT_MANA_COST)) {
        knightify(world, factionId);
        onAction({ type: "knight" });
        return;
      }
    }

    if (populationRatio >= VOLCANO_POPULATION_RATIO) {
      const target = densestOpponentCluster(world, opponentId, DEFAULT_VOLCANO_RADIUS, rng);
      if (target && trySpendMana(world, factionId, VOLCANO_MANA_COST)) {
        applyVolcano(heightmap, target.x, target.y);
        eruptVolcano(world, target.x, target.y, DEFAULT_VOLCANO_RADIUS);
        return;
      }
    }

    const target = densestOpponentCluster(world, opponentId, DEFAULT_EARTHQUAKE_RADIUS, rng);
    if (target && trySpendMana(world, factionId, EARTHQUAKE_MANA_COST)) {
      applyEarthquake(heightmap, target.x, target.y, undefined, undefined, rng);
      onAction({ type: "earthquake", position: target });
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

/**
 * Picks the opponent house surrounded by the most other opponent houses
 * within `radius` — the settlement an earthquake/volcano would actually
 * hit hardest — instead of a uniformly random one. Ties (including the
 * common case of every house being equally isolated) are broken by rng
 * so a single house still gets picked deterministically under a fixed
 * rng in tests.
 */
function densestOpponentCluster(world: World, opponentId: FactionId, radius: number, rng: () => number): Point | null {
  const positions: Point[] = [];
  for (const entity of world.query(House, Position, Owner)) {
    if (world.get(entity, Owner)!.faction === opponentId) positions.push(world.get(entity, Position)!);
  }
  if (positions.length === 0) return null;

  const scores = positions.map((position) => positions.filter((other) => distance(position, other) <= radius).length);
  const bestScore = Math.max(...scores);
  const contenders = positions.filter((_, index) => scores[index] === bestScore);
  return contenders[Math.floor(rng() * contenders.length)];
}
