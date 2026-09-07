import type { ComponentType, System, World } from "../../ecs";
import {
  ENEMY_AI_AGGRESSION_THRESHOLD,
  ENEMY_AI_DECISION_INTERVAL,
  ENEMY_AI_ECONOMY_FLOOR,
  ENEMY_MUSTER_HOUSES,
  ENEMY_AI_THREAT_RADIUS,
} from "../constants";
import { FactionState, House, Owner, Position, Walker, type BehaviorMode, type FactionId } from "../components";
import { HOUSE_LEVELS } from "../constants";
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
    const wantsToMarch = walkerCount >= aggressionThreshold && canAffordToMarch;

    // A crowd is not an army either. A walker takes a house only when its
    // strength beats that house's defense (see systems/combat.ts), and
    // every walker is born at strength 1 while the weakest house defends
    // at 3 — so a faction that marches as it is born can only feed itself
    // to the buildings one walker at a time, which is exactly what it did:
    // measured over three matches, every enemy walker was still strength 1
    // at every sample, and it captured nothing all game.
    //
    // The only thing in this game that adds strength together is gathering
    // (see systems/gather.ts). So the faction musters first: held in
    // "gather" until it has someone who can actually take a house, its
    // strongest walker reached 20 to 51 within a few minutes — enough for
    // a manor, sometimes a castle.
    //
    // It musters for ENEMY_MUSTER_HOUSES of them rather than one, because
    // taking a house now costs a force what that house was worth to defend
    // rather than consuming it whole (see systems/combat.ts) — a force
    // built to clear the bar exactly is spent on its first hut.
    const target = weakestOpposingHouseDefense(world, opponentId);
    const readyToTakeAHouse = target === undefined || strongestWalker(world, factionId) > target * ENEMY_MUSTER_HOUSES;
    const nextMode: BehaviorMode =
      underThreat || (wantsToMarch && readyToTakeAHouse)
        ? "fight"
        : wantsToMarch
          ? "gather"
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

/** The strongest walker a faction has — what decides whether it can take a house at all. */
function strongestWalker(world: World, faction: FactionId): number {
  let strongest = 0;
  for (const entity of world.query(Walker, Owner)) {
    if (world.get(entity, Owner)!.faction !== faction) continue;
    strongest = Math.max(strongest, world.get(entity, Walker)!.strength);
  }
  return strongest;
}

/**
 * The defense of the easiest house the opponent has — the bar a walker has
 * to clear to capture anything. Undefined when the opponent has no houses
 * at all, in which case there is nothing to muster *for*: whatever is left
 * of them is walkers, and any walker can fight a walker.
 */
function weakestOpposingHouseDefense(world: World, opponentId: FactionId): number | undefined {
  let weakest: number | undefined;
  for (const entity of world.query(House, Owner)) {
    if (world.get(entity, Owner)!.faction !== opponentId) continue;
    const defense = HOUSE_LEVELS[world.get(entity, House)!.level].defense;
    if (weakest === undefined || defense < weakest) weakest = defense;
  }
  return weakest;
}
