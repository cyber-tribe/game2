import type { ComponentType, System, World } from "../../ecs";
import {
  ENEMY_AI_AGGRESSION_THRESHOLD,
  ENEMY_AI_DECISION_INTERVAL,
  ENEMY_AI_ECONOMY_FLOOR,
  ENEMY_AI_THREAT_RADIUS,
} from "../constants";
import { FactionState, House, Owner, Position, Walker, type BehaviorMode, type FactionId } from "../components";
import { findFactionEntity } from "../faction";
import { distance } from "./geometry";

export interface EnemyAiConfig {
  factionId: FactionId;
  /** The faction whose walkers count as a threat to factionId's houses. */
  opponentId: FactionId;
  /** Seconds between re-evaluating behaviorMode. */
  decisionInterval: number;
  /** Walker count at/above which the AI goes aggressive. */
  aggressionThreshold: number;
  /** Distance at which an opposing walker near a house forces "fight" mode. */
  threatRadius: number;
  /**
   * Houses the faction wants before it stops settling and marches — see
   * ENEMY_AI_ECONOMY_FLOOR. Defence ignores it.
   */
  economyFloor: number;
}

/**
 * A minimal stand-in for real enemy decision-making (docs/game-system.md's
 * "敵AI"): every decisionInterval seconds, the faction goes to "fight"
 * either once its walker count reaches aggressionThreshold, or once an
 * opposing walker is within threatRadius of one of its houses — so the
 * enemy actually defends a house under siege instead of passively
 * "settling" through it just because its total army is still small.
 * Otherwise it "gather"s until it has a leader — leaderSystem now only
 * ever appoints one while a faction is actively gathering (see leader.ts),
 * and without one the enemy could never knightify (enemyMiracles.ts's
 * auto-knightify needs a live leader) — then falls back to plain
 * "settle" once it has one, same as before. This is deliberately simple —
 * a proper AI would also react to mana and territory — but it gives the
 * enemy some autonomy instead of sitting in "settle" forever. Stops making
 * decisions entirely once FactionState.finalBattle is set by the
 * "最終決戦" miracle, so it can't override the goToShrine march to the
 * final battle.
 */
export function createEnemyAiSystem(config: Partial<EnemyAiConfig> = {}): System {
  const factionId = config.factionId ?? "enemy";
  const opponentId = config.opponentId ?? "player";
  const decisionInterval = config.decisionInterval ?? ENEMY_AI_DECISION_INTERVAL;
  const aggressionThreshold = config.aggressionThreshold ?? ENEMY_AI_AGGRESSION_THRESHOLD;
  const threatRadius = config.threatRadius ?? ENEMY_AI_THREAT_RADIUS;
  const economyFloor = config.economyFloor ?? ENEMY_AI_ECONOMY_FLOOR;
  let timeSinceDecision = decisionInterval;

  return (world, deltaSeconds) => {
    timeSinceDecision += deltaSeconds;
    if (timeSinceDecision < decisionInterval) return;
    timeSinceDecision = 0;

    const factionEntity = findFactionEntity(world, factionId);
    if (factionEntity === undefined) return;

    const state = world.get(factionEntity, FactionState)!;
    if (state.finalBattle) return; // once the final battle starts, there's no going back to routine decisions

    const walkerCount = countOwned(world, factionId, Walker);
    const houseCount = countOwned(world, factionId, House);
    const underThreat = isUnderThreat(world, factionId, opponentId, threatRadius);
    const hasLeader =
      state.leaderId !== undefined && world.isAlive(state.leaderId) && world.has(state.leaderId, Walker);
    // An army is not a war effort. Marching means nobody settles, so a
    // faction that goes aggressive before it has houses never builds one
    // — see ENEMY_AI_ECONOMY_FLOOR. Being attacked overrides it: a
    // faction that answers a raid by carrying on building loses either
    // way.
    const canAffordToMarch = houseCount >= economyFloor;
    const nextMode: BehaviorMode =
      underThreat || (walkerCount >= aggressionThreshold && canAffordToMarch)
        ? "fight"
        : hasLeader
          ? "settle"
          : "gather";

    if (state.behaviorMode !== nextMode) {
      world.add(factionEntity, FactionState, { ...state, behaviorMode: nextMode });
    }
  };
}

function countOwned(world: World, faction: FactionId, component: ComponentType<unknown>): number {
  let count = 0;
  for (const entity of world.query(component, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) count++;
  }
  return count;
}

function isUnderThreat(world: World, factionId: FactionId, opponentId: FactionId, threatRadius: number): boolean {
  const ownHousePositions: { x: number; y: number }[] = [];
  for (const entity of world.query(House, Owner, Position)) {
    if (world.get(entity, Owner)!.faction === factionId) ownHousePositions.push(world.get(entity, Position)!);
  }
  if (ownHousePositions.length === 0) return false;

  for (const entity of world.query(Walker, Owner, Position)) {
    if (world.get(entity, Owner)!.faction !== opponentId) continue;
    const opponentPosition = world.get(entity, Position)!;
    if (ownHousePositions.some((house) => distance(house, opponentPosition) <= threatRadius)) return true;
  }

  return false;
}
