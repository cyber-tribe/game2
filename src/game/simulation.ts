import { Scheduler, World } from "../ecs";
import { FactionState, House, Owner, Position, Walker, type FactionId } from "./components";
import { DEFAULT_WALKER_SPEED, TILES_PER_HOUSE_CAP } from "./constants";
import { createFaction } from "./faction";
import { houseCaptureSystem, walkerCombatSystem } from "./systems/combat";
import { createHouseGrowthSystem } from "./systems/houseGrowth";
import { manaSystem } from "./systems/mana";
import { movementSystem } from "./systems/movement";
import { settleSystem } from "./systems/settle";
import { createWanderTargetSystem } from "./systems/wanderTarget";

export interface SimulationConfig {
  worldWidth: number;
  worldHeight: number;
  /** Walkers each faction starts with. */
  initialWalkersPerFaction?: number;
}

export interface FactionSummary {
  id: FactionId;
  mana: number;
  houses: number;
  walkers: number;
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
      .add(createWanderTargetSystem())
      .add(movementSystem)
      .add(walkerCombatSystem)
      .add(houseCaptureSystem)
      .add(settleSystem)
      .add(createHouseGrowthSystem({ maxHousesPerFaction }))
      .add(manaSystem);
  }

  update(deltaSeconds: number): void {
    this.scheduler.update(this.world, deltaSeconds);
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

      summaries.push({ id: state.id, mana: state.mana, houses, walkers });
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
