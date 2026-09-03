export * from "./components";
export * from "./constants";
export { createFaction, findFactionEntity, trySpendMana } from "./faction";
export { movementSystem } from "./systems/movement";
export { createWanderTargetSystem, type WanderTargetConfig } from "./systems/wanderTarget";
export { createSettleSystem, type SettleConfig } from "./systems/settle";
export { createHouseGrowthSystem, type HouseGrowthConfig } from "./systems/houseGrowth";
export { createHouseUpgradeSystem, type HouseUpgradeConfig } from "./systems/houseUpgrade";
export { manaSystem } from "./systems/mana";
export { houseCaptureSystem, walkerCombatSystem } from "./systems/combat";
export { gatherSystem } from "./systems/gather";
export { fightTargetingSystem } from "./systems/fightTargeting";
export { createEnemyAiSystem, type EnemyAiConfig } from "./systems/enemyAi";
export { createSwamp } from "./swamp";
export { swampSystem } from "./systems/swamp";
export {
  Simulation,
  type FactionSummary,
  type GameOutcome,
  type SimulationConfig,
} from "./simulation";
