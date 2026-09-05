export * from "./components";
export * from "./constants";
export { createFaction, findFactionEntity, moveShrine, trySpendMana } from "./faction";
export { movementSystem } from "./systems/movement";
export { createWanderTargetSystem, type WanderTargetConfig } from "./systems/wanderTarget";
export { createSettleSystem, type SettleConfig } from "./systems/settle";
export { createHouseGrowthSystem, type HouseGrowthConfig } from "./systems/houseGrowth";
export { createHouseUpgradeSystem, type HouseUpgradeConfig } from "./systems/houseUpgrade";
export { manaSystem } from "./systems/mana";
export { createHouseCaptureSystem, createWalkerCombatSystem, type WalkerCombatConfig } from "./systems/combat";
export { gatherSystem } from "./systems/gather";
export { fightTargetingSystem } from "./systems/fightTargeting";
export { createEnemyAiSystem, type EnemyAiConfig } from "./systems/enemyAi";
export { leaderSystem } from "./systems/leader";
export { goToShrineSystem } from "./systems/goToShrine";
export { createSwamp } from "./swamp";
export { createSwampSystem, type SwampConfig } from "./systems/swamp";
export type { ImpactEffectEvent, ImpactEffectSnapshot, ImpactEffectType, OnImpactEffect } from "./systems/effects";
export { eruptVolcano } from "./volcano";
export { drownFlood } from "./flood";
export { guardianify, knightify } from "./hero";
export { guardianTargetingSystem, heroCooldownSystem, knightTargetingSystem } from "./systems/hero";
export { triggerArmageddon } from "./armageddon";
export {
  Simulation,
  type FactionSummary,
  type GameOutcome,
  type SimulationConfig,
} from "./simulation";
