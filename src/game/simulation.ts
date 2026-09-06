import { Scheduler, World } from "../ecs";
import type { Heightmap, TerrainEditRule } from "../world/heightmap";
import { triggerArmageddon } from "./armageddon";
import {
  FactionState,
  House,
  Owner,
  Position,
  Walker,
  type BehaviorMode,
  type FactionId,
  type HeroKind,
  type HouseLevel,
  type WalkerState,
} from "./components";
import { DEFAULT_WALKER_SPEED, FARMLAND_RADIUS, HOUSE_LEVELS, IMPACT_EFFECT_DURATION, INITIAL_WALKER_SPREAD, TILES_PER_HOUSE_CAP } from "./constants";
import { createFaction, findFactionEntity, moveShrine } from "./faction";
import { promoteHero } from "./hero";
import { totalPopulation } from "./population";
import { releasePopulation } from "./populationRelease";
import { createHouseCaptureSystem, createWalkerCombatSystem } from "./systems/combat";
import type { ImpactEffectEvent, ImpactEffectSnapshot } from "./systems/effects";
import { createDrowningSystem } from "./systems/drowning";
import { createEnemyAiSystem } from "./systems/enemyAi";
import { createEnemyMiracleSystem, type EnemyMiracleEvent } from "./systems/enemyMiracles";
import { createEnemyTerraformSystem } from "./systems/enemyTerraform";
import { fightTargetingSystem } from "./systems/fightTargeting";
import { gatherSystem } from "./systems/gather";
import { gatherTargetingSystem } from "./systems/gatherTargeting";
import { goToShrineSystem } from "./systems/goToShrine";
import { createHouseGrowthSystem } from "./systems/houseGrowth";
import { createHouseUpgradeSystem } from "./systems/houseUpgrade";
import { guardianTargetingSystem, heroAdvanceTargetingSystem, heroCooldownSystem } from "./systems/hero";
import { leaderSystem } from "./systems/leader";
import { manaSystem } from "./systems/mana";
import { createMovementSystem } from "./systems/movement";
import { createSettleSystem } from "./systems/settle";
import { createCreviceSystem } from "./systems/crevice";
import { createFungusSystem } from "./systems/fungus";
import { createHelenSystem } from "./systems/helen";
import { createHeroLossSystem } from "./systems/heroLoss";
import { createHolyWaterSystem } from "./systems/holyWater";
import { createFirePillarSystem } from "./systems/firePillar";
import { createTornadoSystem } from "./systems/tornado";
import { createWhirlpoolSystem } from "./systems/whirlpool";
import { createSwampSystem } from "./systems/swamp";
import { createWanderTargetSystem } from "./systems/wanderTarget";
import { ALL_MIRACLES, type EnemyPersonality, type MiracleId } from "./worlds";

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
  /**
   * Same per-match restriction on raise/lower the player's own taps are
   * gated by (see world/heightmap.ts's TerrainEditRule) — passed through
   * to the enemy's own terraforming so it plays by the same rule ("敵の神
   * はプレイヤーと同じルールで介入する"). Defaults to "both" (today's
   * unrestricted behavior) when omitted, which is fine for tests that
   * don't care about it.
   */
  terrainEditRule?: TerrainEditRule;
  /**
   * Per-world enemy AI tuning (docs/game-system.md 10節's "攻撃性"／
   * "介入速度" — see game/worlds.ts's WorldDefinition doc comment for why
   * "賢さ" itself isn't touched here). Feeds both createEnemyAiSystem's
   * and createEnemyMiracleSystem's decisionInterval, so a harder world's
   * enemy re-evaluates both its behaviorMode and its miracle choices more
   * often. Defaults to each system's own constant when omitted, which is
   * fine for tests that don't care about it.
   */
  enemyDecisionInterval?: number;
  enemyAggressionThreshold?: number;
  /**
   * Same per-world "使用可能な奇跡の制限" (see game/worlds.ts's
   * WorldDefinition.allowedMiracles) applied to the enemy's own miracle
   * casting (enemyMiracles.ts), not just the player's toolbar — "敵の神は
   * プレイヤーと同じルールで介入する". Only earthquake/volcano/ペルセウス/
   * armageddon are ever cast by the enemy, so restricting swamp/tsunami/
   * shrine here has no effect on it. Defaults to every miracle unlocked
   * when omitted, which is fine for tests that don't care about it.
   */
  allowedMiracles?: readonly MiracleId[];
  /**
   * The enemy god's play style for this world — see game/worlds.ts's
   * WorldDefinition.enemyPersonality and constants.ts's ENEMY_PERSONALITY_
   * TUNING. Defaults to "balanced" (today's original thresholds) when
   * omitted, which is fine for tests that don't care about it.
   */
  enemyPersonality?: EnemyPersonality;
  /**
   * Called whenever the enemy actually casts a miracle (see
   * enemyMiracles.ts's EnemyMiracleEvent) — lets main.ts surface it
   * (screen shake, a toast) even when it happens off the player's
   * current view, without the simulation itself knowing anything about
   * rendering.
   */
  onEnemyAction?: (event: EnemyMiracleEvent) => void;
  /**
   * Same per-world "海がマグマ" theming (see game/worlds.ts's
   * WorldDefinition.instantDrowning) applied to systems/drowning.ts: skips
   * the gradual breath countdown and drowns a walker outright the instant
   * it's caught in a genuine body of water. Defaults to false (today's new
   * gradual/recoverable behavior) when omitted, which is fine for tests
   * that don't care about it.
   */
  instantDrowning?: boolean;
}

export interface FactionSummary {
  id: FactionId;
  mana: number;
  houses: number;
  /** Same value for every faction — see Simulation.maxHousesPerFaction. */
  housesCap: number;
  walkers: number;
  behaviorMode: BehaviorMode;
  /** See population.ts's totalPopulation — houses' accumulated population plus one per walker. */
  population: number;
}

/**
 * A single walker or house's own detail — docs/game-system.md 11節's
 * "任意のウォーカー・家を照会して人数／強さ／発達段階を確認できる"
 * 情報パネル. Deliberately plain data (no rendering concerns): main.ts
 * does its own screen-space hit-testing against `position` via
 * IsoRenderer.project, and render/entityInfoLabel.ts turns the result
 * into the Japanese text actually shown.
 */
export type InspectableEntity =
  | { kind: "walker"; faction: FactionId; position: Position; strength: number; state: WalkerState }
  | { kind: "house"; faction: FactionId; position: Position; level: HouseLevel; population: number; capacity: number };

export interface GameOutcome {
  over: boolean;
  /**
   * Absent when the game isn't over yet, or in the edge case where both
   * factions lose their last walker/house on the same tick — a draw the
   * design doc doesn't otherwise account for ("引き分けはなく").
   */
  winner?: FactionId;
}

/**
 * Every notable action a match's event log can record: every miracle
 * (deliberately excludes the plain raise/lower terrain edit, same
 * reasoning as main.ts's vibrate() — it's the core, extremely frequent
 * action, so logging every tap would bury the events actually worth
 * telling a story about) plus a few house milestones dramatic enough to
 * be worth their own line (captured, burned by a hero, or reaching the
 * top "castle" tier — but not every intermediate upgrade/downgrade, which
 * is far too routine).
 */
export type MatchEventType =
  | "shrineMove"
  | "earthquake"
  | "swamp"
  | "holyWater"
  | "tornado"
  | "firePillar"
  | "hurricane"
  | "volcano"
  | "forest"
  | "flower"
  | "fireRain"
  | "perseus"
  | "hercules"
  | "odysseus"
  | "achilles"
  | "adonis"
  | "helen"
  | "guardian"
  | "heroLost"
  | "armageddon"
  | "tsunami"
  | "reef"
  | "road"
  | "fungus"
  | "houseCaptured"
  | "houseBurned"
  | "houseReachedCastle";

/**
 * A notable action recorded during a match — the raw material for a
 * post-game recap ("戦いの記録"), per feedback that a bare win/lose line
 * tells none of the match's actual story. Presentation (icons, Japanese
 * phrasing) lives in render/matchEventLabels.ts, not here.
 */
export interface MatchEvent {
  /** Seconds since the match started (frozen once the game is over). */
  time: number;
  faction: FactionId;
  type: MatchEventType;
}

/** Owns the ECS world for one match and drives it tick by tick. */
export class Simulation {
  readonly world = new World();
  private readonly scheduler = new Scheduler();
  private readonly worldCenter: { x: number; y: number };

  /**
   * A faction stops spawning new walkers once it owns this many houses —
   * see houseGrowth.ts's HouseGrowthConfig.maxHousesPerFaction doc comment
   * for why this stand-in for real land scarcity exists. Exposed here so
   * the HUD can show it: without visible feedback, hitting the cap looks
   * identical to a stuck/broken game ("walkerが発生しない") rather than
   * an intentional, explainable limit.
   */
  readonly maxHousesPerFaction: number;

  private readonly matchEvents: MatchEvent[] = [];
  private elapsedTime = 0;
  /**
   * Set whenever a system changes the terrain on its own — 毒カビ's
   * growth (see systems/fungus.ts), a 渦巻き eating the coast (see
   * systems/whirlpool.ts) and a 火柱 burning it barren (see
   * systems/firePillar.ts). Read and cleared by
   * consumeTerrainChanged; see its doc comment for why the renderer cannot
   * simply notice by itself.
   */
  private terrainChanged = false;

  /**
   * Brief visual bursts for kills/captures/drownings — see
   * systems/effects.ts's doc comment on why these are a plain array here
   * rather than ECS entities. Aged (and pruned once past IMPACT_EFFECT_
   * DURATION) every update(), the same way matchEvents are timestamped
   * against elapsedTime but never pruned — these need pruning since
   * EntityLayer redraws all of them every frame, not just the newest.
   */
  private impactEffects: ImpactEffectSnapshot[] = [];

  constructor(config: SimulationConfig) {
    const playerShrine = { x: config.worldWidth * 0.25, y: config.worldHeight * 0.75 };
    const enemyShrine = { x: config.worldWidth * 0.75, y: config.worldHeight * 0.25 };
    this.worldCenter = { x: config.worldWidth / 2, y: config.worldHeight / 2 };

    createFaction(this.world, "player", playerShrine);
    createFaction(this.world, "enemy", enemyShrine);

    const initialWalkers = config.initialWalkersPerFaction ?? 3;
    this.spawnWalkers("player", playerShrine, initialWalkers);
    this.spawnWalkers("enemy", enemyShrine, initialWalkers);

    const maxHousesPerFaction = Math.max(
      1,
      Math.floor((config.worldWidth * config.worldHeight) / TILES_PER_HOUSE_CAP),
    );
    this.maxHousesPerFaction = maxHousesPerFaction;

    this.scheduler
      .add(
        createEnemyAiSystem({
          decisionInterval: config.enemyDecisionInterval,
          aggressionThreshold: config.enemyAggressionThreshold,
        }),
      )
      .add(leaderSystem)
      .add(fightTargetingSystem)
      .add(goToShrineSystem)
      .add(gatherTargetingSystem)
      .add(heroAdvanceTargetingSystem)
      .add(guardianTargetingSystem)
      .add(createHelenSystem())
      .add(heroCooldownSystem)
      .add(createHeroLossSystem({ onHeroLost: (faction) => this.recordEvent(faction, "heroLost") }))
      .add(createWanderTargetSystem({ heightmap: config.heightmap }))
      .add(createMovementSystem({ heightmap: config.heightmap }))
      .add(gatherSystem)
      .add(createSwampSystem({ onImpact: (event) => this.recordImpactEffect(event) }))
      .add(createHolyWaterSystem({ onImpact: (event) => this.recordImpactEffect(event) }))
      .add(
        createTornadoSystem({
          heightmap: config.heightmap,
          onImpact: (event) => this.recordImpactEffect(event),
        }),
      )
      .add(
        createFirePillarSystem({
          heightmap: config.heightmap,
          onImpact: (event) => this.recordImpactEffect(event),
          onScorch: () => {
            this.terrainChanged = true;
          },
        }),
      )
      .add(
        createWhirlpoolSystem({
          heightmap: config.heightmap,
          onImpact: (event) => this.recordImpactEffect(event),
          onErode: () => {
            this.terrainChanged = true;
          },
        }),
      )
      .add(createCreviceSystem({ heightmap: config.heightmap, onImpact: (event) => this.recordImpactEffect(event) }))
      .add(
        createFungusSystem({
          heightmap: config.heightmap,
          onImpact: (event) => this.recordImpactEffect(event),
          onSpread: () => {
            this.terrainChanged = true;
          },
        }),
      )
      .add(
        createDrowningSystem({
          heightmap: config.heightmap,
          instant: config.instantDrowning,
          onImpact: (event) => this.recordImpactEffect(event),
        }),
      )
      .add(createWalkerCombatSystem({ onImpact: (event) => this.recordImpactEffect(event) }))
      .add(
        createHouseCaptureSystem({
          onCapture: (faction) => this.recordEvent(faction, "houseCaptured"),
          onBurn: (faction) => this.recordEvent(faction, "houseBurned"),
          onImpact: (event) => this.recordImpactEffect(event),
        }),
      )
      .add(createSettleSystem({ heightmap: config.heightmap, maxHousesPerFaction }))
      .add(
        createHouseUpgradeSystem({
          heightmap: config.heightmap,
          onReachCastle: (faction) => this.recordEvent(faction, "houseReachedCastle"),
        }),
      )
      .add(createHouseGrowthSystem({ maxHousesPerFaction, heightmap: config.heightmap }))
      .add(manaSystem)
      .add(createEnemyTerraformSystem({ heightmap: config.heightmap, terrainEditRule: config.terrainEditRule }))
      .add(
        createEnemyMiracleSystem({
          heightmap: config.heightmap,
          worldCenter: this.worldCenter,
          decisionInterval: config.enemyDecisionInterval,
          allowedMiracles: config.allowedMiracles ?? ALL_MIRACLES,
          personality: config.enemyPersonality,
          onAction: (event) => {
            this.recordEvent("enemy", event.type);
            config.onEnemyAction?.(event);
          },
        }),
      );
  }

  /** No-ops once the game is over, per docs/game-system.md's win/lose rules. */
  update(deltaSeconds: number): void {
    if (this.getOutcome().over) return;
    this.elapsedTime += deltaSeconds;
    this.scheduler.update(this.world, deltaSeconds);

    this.impactEffects = this.impactEffects
      .map((effect) => ({ ...effect, age: effect.age + deltaSeconds }))
      .filter((effect) => effect.age < IMPACT_EFFECT_DURATION);
  }

  /**
   * Appends a miracle cast to the match's event log, timestamped against
   * how long the match has run so far. main.ts calls this for the
   * player's own casts (mirroring its vibrate()/triggerShake() call
   * sites); the enemy's are recorded automatically above.
   */
  recordEvent(faction: FactionId, type: MatchEventType): void {
    this.matchEvents.push({ time: this.elapsedTime, faction, type });
  }

  /** The match's full event log so far, oldest first — see MatchEvent. */
  getMatchEvents(): readonly MatchEvent[] {
    return this.matchEvents;
  }

  /**
   * Records a brief visual burst at `event.position` — see
   * systems/effects.ts. Wired automatically into the combat/swamp/house-
   * capture systems above; main.ts calls this directly for drownFlood
   * (not itself a scheduled System, so it can't take an onImpact config
   * the same way).
   */
  recordImpactEffect(event: ImpactEffectEvent): void {
    this.impactEffects.push({ ...event, age: 0 });
  }

  /**
   * Whether the terrain changed by itself since this was last asked, and
   * clears the flag.
   *
   * main.ts's ticker skips rebuilding the terrain mesh whenever the camera
   * hasn't moved and nothing is still animating — a real saving, since
   * that rebuild scales with visible tile count. 毒カビ breaks that
   * assumption: it grows on its own clock, moving no camera and animating
   * no elevation, so without this its spread stayed invisible until the
   * player happened to pan or cast something.
   */
  consumeTerrainChanged(): boolean {
    const changed = this.terrainChanged;
    this.terrainChanged = false;
    return changed;
  }

  /** Every ImpactEffect still within its visible lifetime — see EntityLayer. */
  getImpactEffects(): readonly ImpactEffectSnapshot[] {
    return this.impactEffects;
  }

  /** Switches a faction's influence mode (docs/game-system.md's 行動方針). Free — no mana cost. */
  setBehaviorMode(faction: FactionId, mode: BehaviorMode): void {
    const entity = findFactionEntity(this.world, faction);
    if (entity === undefined) return;
    const state = this.world.get(entity, FactionState)!;
    this.world.add(entity, FactionState, { ...state, behaviorMode: mode });
  }

  /**
   * A faction's current mana — main.ts uses this to show the player a
   * clear "マナが足りません" message and to dim toolbar buttons it can't
   * currently afford, instead of a tap on an unaffordable miracle silently
   * doing nothing (see trySpendMana, which is what actually enforces the
   * cost — this is read-only).
   */
  getMana(faction: FactionId): number {
    const entity = findFactionEntity(this.world, faction);
    return entity === undefined ? 0 : this.world.get(entity, FactionState)!.mana;
  }

  getBehaviorMode(faction: FactionId): BehaviorMode | undefined {
    const entity = findFactionEntity(this.world, faction);
    return entity === undefined ? undefined : this.world.get(entity, FactionState)!.behaviorMode;
  }

  /**
   * Whether (tile.x + 0.5, tile.y + 0.5) falls within another faction's own
   * "territory" — the same farmland radius EntityLayer already tints
   * around each of that faction's houses (see FARMLAND_RADIUS's own doc
   * comment on why that's a house's visual sphere of influence). Some
   * worlds forbid the player from directly raising/lowering/flattening
   * land here at all — see WorldDefinition's enemyTerritoryEditable, which
   * main.ts's applyTerrainEditAt actually gates through; this is just the
   * read-only geometry check.
   */
  isEnemyTerritory(faction: FactionId, tile: { x: number; y: number }): boolean {
    const center = { x: tile.x + 0.5, y: tile.y + 0.5 };
    for (const entity of this.world.query(House, Owner, Position)) {
      if (this.world.get(entity, Owner)!.faction === faction) continue;
      const house = this.world.get(entity, House)!;
      const pos = this.world.get(entity, Position)!;
      if (Math.hypot(pos.x - center.x, pos.y - center.y) <= FARMLAND_RADIUS[house.level]) return true;
    }
    return false;
  }

  /** The "集結シンボル移動" miracle — relocates where "goToShrine" mode leads the army. */
  moveShrine(faction: FactionId, position: { x: number; y: number }): void {
    moveShrine(this.world, faction, position);
  }

  /**
   * Where a faction's shrine currently is — main.ts uses this to center
   * the initial camera on the player's own starting village, since the
   * map is otherwise far bigger than any one screen (see
   * plan/0062-original-scale-map.md).
   */
  getShrinePosition(faction: FactionId): Position | undefined {
    const entity = findFactionEntity(this.world, faction);
    return entity === undefined ? undefined : this.world.get(entity, FactionState)!.shrinePosition;
  }

  /** The hero miracles — turns a faction's current leader into `kind`. See hero.ts. */
  promoteHero(faction: FactionId, kind: HeroKind): void {
    promoteHero(this.world, faction, kind);
  }

  /**
   * The "人口放出" action — see populationRelease.ts. Free, like
   * setBehaviorMode; returns how many walkers were actually released so
   * callers can skip feedback (haptics, etc.) on a no-op tap.
   */
  releasePopulation(faction: FactionId): number {
    return releasePopulation(this.world, faction, this.maxHousesPerFaction);
  }

  /**
   * The "最終決戦" miracle — abandons every house on both sides and sends
   * everyone to the map's center for a final battle. Affects both factions
   * regardless of who casts it.
   */
  triggerArmageddon(): void {
    triggerArmageddon(this.world, this.worldCenter);
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

      summaries.push({
        id: state.id,
        mana: state.mana,
        houses,
        housesCap: this.maxHousesPerFaction,
        walkers,
        behaviorMode: state.behaviorMode,
        population: totalPopulation(this.world, state.id),
      });
    }

    return summaries;
  }

  /** Every walker/house on the map, for the "照会" 情報パネル (see InspectableEntity). */
  listInspectableEntities(): InspectableEntity[] {
    const entities: InspectableEntity[] = [];

    for (const entity of this.world.query(Walker, Position, Owner)) {
      const walker = this.world.get(entity, Walker)!;
      entities.push({
        kind: "walker",
        faction: this.world.get(entity, Owner)!.faction,
        position: this.world.get(entity, Position)!,
        strength: walker.strength,
        state: walker.state,
      });
    }

    for (const entity of this.world.query(House, Position, Owner)) {
      const house = this.world.get(entity, House)!;
      entities.push({
        kind: "house",
        faction: this.world.get(entity, Owner)!.faction,
        position: this.world.get(entity, Position)!,
        level: house.level,
        population: house.population,
        capacity: HOUSE_LEVELS[house.level].capacity,
      });
    }

    return entities;
  }

  /**
   * Places a faction's starting walkers in a ring around its shrine rather
   * than all on the exact same point.
   *
   * They used to share one position exactly, and on slow terrain they can
   * stay there for a minute — nothing makes an idle walker move, and
   * settling happens wherever one stands. Measured on the final world's
   * rock terrain, a faction still occupied a single point at 40 seconds:
   * three walkers, then three houses, all at identical coordinates. A
   * single area miracle of any size therefore erased an entire faction,
   * which is what made an opening cast able to end a match outright (see
   * plan/0107).
   *
   * Deterministic, not random: a match's opening should not vary in a way
   * nobody can see, and the ring is the shape "everyone gathered at the
   * shrine" ought to have had in the first place.
   */
  private spawnWalkers(faction: FactionId, origin: { x: number; y: number }, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const walker = this.world.createEntity();
      this.world.add(walker, Position, {
        x: origin.x + Math.cos(angle) * INITIAL_WALKER_SPREAD,
        y: origin.y + Math.sin(angle) * INITIAL_WALKER_SPREAD,
      });
      this.world.add(walker, Owner, { faction });
      this.world.add(walker, Walker, { strength: 1, state: "seeking", speed: DEFAULT_WALKER_SPEED });
    }
  }
}
