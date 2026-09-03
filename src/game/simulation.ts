import { Scheduler, World } from "../ecs";
import type { Heightmap } from "../world/heightmap";
import { FactionState, House, Owner, Position, Walker, type BehaviorMode, type FactionId } from "./components";
import { DEFAULT_WALKER_SPEED, TILES_PER_HOUSE_CAP } from "./constants";
import { createFaction, findFactionEntity } from "./faction";
import { houseCaptureSystem, walkerCombatSystem } from "./systems/combat";
import { createEnemyAiSystem } from "./systems/enemyAi";
import { fightTargetingSystem } from "./systems/fightTargeting";
import { gatherSystem } from "./systems/gather";
import { createHouseGrowthSystem } from "./systems/houseGrowth";
import { createHouseUpgradeSystem } from "./systems/houseUpgrade";
import { manaSystem } from "./systems/mana";
import { movementSystem } from "./systems/movement";
import { createSettleSystem } from "./systems/settle";
import { swampSystem } from "./systems/swamp";
import { createWanderTargetSystem } from "./systems/wanderTarget";

export interface SimulationConfig {
  worldWidth: number;
  worldHeight: number;
  /** Walkers each faction starts with. */
  initialWalkersPerFaction?: number;
  /**
   * When given, walkers only wander toward and settle on buildable (above
   * sea level) land — see docs/game-system.md. Without it, they treat the
   * whole map as flat buildable ground, which is fine for tests that don't
   * care about terrain.
   */
  heightmap?: Heightmap;
}

export interface FactionSummary {
  id: FactionId;
  mana: number;
  houses: number;
  walkers: number;
  behaviorMode: BehaviorMode;
}

export interface GameOutcome {
  over: boolean;
  /**
   * Absent when the game isn't over yet, or in the edge case where both
   * factions lose their last walker/house on the same tick — a draw the
   * design doc doesn't otherwise account for ("引き分けはなく").
   */
  winner?: FactionId;
}

/** Owns the ECS world for one match and drives it tick by tick. */
export class Simulation {
  readonly world = new World();
  private readonly scheduler = new Scheduler();

  constructor(config: SimulationConfig) {
    const playerShrine = { x: config.worldWidth * 0.25, y: config.worldHeight * 0.75 };
    const enemyShrine = { x: config.worldWidth * 0.75, y: config.worldHeight * 0.25 };

    createFaction(this.world, "player", playerShrine);
    createFaction(this.world, "enemy", enemyShrine);

    const initialWalkers = config.initialWalkersPerFaction ?? 3;
    this.spawnWalkers("player", playerShrine, initialWalkers);
    this.spawnWalkers("enemy", enemyShrine, initialWalkers);

    const maxHousesPerFaction = Math.max(
      1,
      Math.floor((config.worldWidth * config.worldHeight) / TILES_PER_HOUSE_CAP),
    );

    this.scheduler
      .add(createEnemyAiSystem())
      .add(fightTargetingSystem)
      .add(createWanderTargetSystem({ heightmap: config.heightmap }))
      .add(movementSystem)
      .add(gatherSystem)
      .add(swampSystem)
      .add(walkerCombatSystem)
      .add(houseCaptureSystem)
      .add(createSettleSystem({ heightmap: config.heightmap }))
      .add(createHouseUpgradeSystem({ heightmap: config.heightmap }))
      .add(createHouseGrowthSystem({ maxHousesPerFaction }))
      .add(manaSystem);
  }

  /** No-ops once the game is over, per docs/game-system.md's win/lose rules. */
  update(deltaSeconds: number): void {
    if (this.getOutcome().over) return;
    this.scheduler.update(this.world, deltaSeconds);
  }

  /** Switches a faction's influence mode (docs/game-system.md's 行動方針). Free — no mana cost. */
  setBehaviorMode(faction: FactionId, mode: BehaviorMode): void {
    const entity = findFactionEntity(this.world, faction);
    if (entity === undefined) return;
    const state = this.world.get(entity, FactionState)!;
    this.world.add(entity, FactionState, { ...state, behaviorMode: mode });
  }

  getBehaviorMode(faction: FactionId): BehaviorMode | undefined {
    const entity = findFactionEntity(this.world, faction);
    return entity === undefined ? undefined : this.world.get(entity, FactionState)!.behaviorMode;
  }

  /**
   * A faction with no walkers and no houses left has lost
   * ("敗北：自陣営の民が全滅する"). The other side wins.
   */
  getOutcome(): GameOutcome {
    const survivors = this.summarize().filter((s) => s.walkers > 0 || s.houses > 0);

    if (survivors.length > 1) return { over: false };
    return { over: true, winner: survivors[0]?.id };
  }

  /** Per-faction snapshot used by the HUD and by tests. */
  summarize(): FactionSummary[] {
    const summaries: FactionSummary[] = [];

    for (const factionEntity of this.world.query(FactionState)) {
      const state = this.world.get(factionEntity, FactionState)!;
      let houses = 0;
      let walkers = 0;

      for (const entity of this.world.query(House, Owner)) {
        if (this.world.get(entity, Owner)!.faction === state.id) houses++;
      }
      for (const entity of this.world.query(Walker, Owner)) {
        if (this.world.get(entity, Owner)!.faction === state.id) walkers++;
      }

      summaries.push({ id: state.id, mana: state.mana, houses, walkers, behaviorMode: state.behaviorMode });
    }

    return summaries;
  }

  private spawnWalkers(faction: FactionId, origin: { x: number; y: number }, count: number): void {
    for (let i = 0; i < count; i++) {
      const walker = this.world.createEntity();
      this.world.add(walker, Position, { x: origin.x, y: origin.y });
      this.world.add(walker, Owner, { faction });
      this.world.add(walker, Walker, { strength: 1, state: "seeking", speed: DEFAULT_WALKER_SPEED });
    }
  }
}
