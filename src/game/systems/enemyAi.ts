import type { ComponentType, System, World } from "../../ecs";
import { ENEMY_AI_AGGRESSION_THRESHOLD, ENEMY_AI_DECISION_INTERVAL } from "../constants";
import { FactionState, Owner, Walker, type BehaviorMode, type FactionId } from "../components";
import { findFactionEntity } from "../faction";

export interface EnemyAiConfig {
  factionId: FactionId;
  /** Seconds between re-evaluating behaviorMode. */
  decisionInterval: number;
  /** Walker count at/above which the AI goes aggressive. */
  aggressionThreshold: number;
}

/**
 * A minimal stand-in for real enemy decision-making (docs/game-system.md's
 * "敵AI"): every decisionInterval seconds, the faction goes to "fight"
 * once its walker count reaches aggressionThreshold, and otherwise
 * settles. This is deliberately simple — a proper AI would also react to
 * mana, threats, and territory — but it gives the enemy some autonomy
 * instead of sitting in "settle" forever. Stops making decisions entirely
 * once FactionState.finalBattle is set by the "最終決戦" miracle, so it
 * can't override the goToShrine march to the final battle.
 */
export function createEnemyAiSystem(config: Partial<EnemyAiConfig> = {}): System {
  const factionId = config.factionId ?? "enemy";
  const decisionInterval = config.decisionInterval ?? ENEMY_AI_DECISION_INTERVAL;
  const aggressionThreshold = config.aggressionThreshold ?? ENEMY_AI_AGGRESSION_THRESHOLD;
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
    const nextMode: BehaviorMode = walkerCount >= aggressionThreshold ? "fight" : "settle";

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
