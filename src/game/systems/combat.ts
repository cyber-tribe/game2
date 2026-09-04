import type { Entity, System, World } from "../../ecs";
import { COMBAT_RANGE, HOUSE_LEVELS, KNIGHT_BURN_COOLDOWN } from "../constants";
import { House, KnightCooldown, Owner, Position, Walker, type FactionId } from "../components";
import type { OnImpactEffect } from "./effects";
import { distance, type Point } from "./geometry";

function withinRange(a: Point, b: Point): boolean {
  return distance(a, b) <= COMBAT_RANGE;
}

export interface WalkerCombatConfig {
  /** Called once per walker destroyed in a fight — see systems/effects.ts. */
  onImpact: OnImpactEffect;
}

/**
 * Any two walkers from opposing factions within COMBAT_RANGE fight: the
 * stronger one survives with its strength reduced by the loser's, and the
 * loser is destroyed. An exact tie destroys both. This runs regardless of
 * behaviorMode — per docs/game-system.md, contact between enemy walkers
 * always triggers combat.
 *
 * O(n²) over all walkers; fine at prototype scale, but will need spatial
 * partitioning once walker counts grow large.
 */
export function createWalkerCombatSystem(config: Partial<WalkerCombatConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});

  return (world) => {
    const walkers = world.query(Position, Walker, Owner);

    for (let i = 0; i < walkers.length; i++) {
      const a = walkers[i];
      if (!world.isAlive(a)) continue;

      for (let j = i + 1; j < walkers.length; j++) {
        const b = walkers[j];
        if (!world.isAlive(b)) continue;
        if (world.get(a, Owner)!.faction === world.get(b, Owner)!.faction) continue;
        if (!withinRange(world.get(a, Position)!, world.get(b, Position)!)) continue;

        resolveWalkerFight(world, a, b, onImpact);
        if (!world.isAlive(a)) break;
      }
    }
  };
}

function resolveWalkerFight(world: World, a: Entity, b: Entity, onImpact: OnImpactEffect): void {
  const walkerA = world.get(a, Walker)!;
  const walkerB = world.get(b, Walker)!;
  const posA = world.get(a, Position)!;
  const posB = world.get(b, Position)!;

  if (walkerA.strength > walkerB.strength) {
    world.add(a, Walker, { ...walkerA, strength: walkerA.strength - walkerB.strength });
    world.destroyEntity(b);
    onImpact({ position: posB, type: "combatDeath" });
  } else if (walkerB.strength > walkerA.strength) {
    world.add(b, Walker, { ...walkerB, strength: walkerB.strength - walkerA.strength });
    world.destroyEntity(a);
    onImpact({ position: posA, type: "combatDeath" });
  } else {
    world.destroyEntity(a);
    world.destroyEntity(b);
    onImpact({ position: posA, type: "combatDeath" });
    onImpact({ position: posB, type: "combatDeath" });
  }
}

export interface HouseCaptureConfig {
  /** Called when an attacker's strength beats a house's defense and takes it over. */
  onCapture: (attackerFaction: FactionId) => void;
  /** Called when a knight burns a house down instead of capturing it. */
  onBurn: (attackerFaction: FactionId) => void;
  /** Called once per capture/burn/repel — see systems/effects.ts. */
  onImpact: OnImpactEffect;
}

/**
 * A walker that reaches an enemy house assaults it: if its strength beats
 * the house's defense, the house is captured (its owner flips and its
 * population resets, but its level/structure survives); otherwise the
 * walker is simply repelled. Either way the attacking walker is consumed —
 * per docs/game-system.md a house fight always ends with capture or the
 * attacker's defeat, never a draw that leaves both sides as they were.
 *
 * A knight is the one exception: per docs/game-system.md, "敵の...家を
 * （奪わず）焼き払う" — it burns the house down (destroys it outright,
 * regardless of defense) rather than capturing it, and survives to keep
 * marching ("指示に依存せず戦い続ける").
 */
export function createHouseCaptureSystem(config: Partial<HouseCaptureConfig> = {}): System {
  const onCapture = config.onCapture ?? (() => {});
  const onBurn = config.onBurn ?? (() => {});
  const onImpact = config.onImpact ?? (() => {});

  return (world) => {
    for (const walkerEntity of world.query(Position, Walker, Owner)) {
      const walkerPos = world.get(walkerEntity, Position)!;
      const walkerOwner = world.get(walkerEntity, Owner)!;
      const walker = world.get(walkerEntity, Walker)!;
      const isKnight = walker.state === "knight";

      for (const houseEntity of world.query(Position, House, Owner)) {
        const houseOwner = world.get(houseEntity, Owner)!;
        if (houseOwner.faction === walkerOwner.faction) continue;
        const housePos = world.get(houseEntity, Position)!;
        if (!withinRange(walkerPos, housePos)) continue;

        if (isKnight) {
          world.destroyEntity(houseEntity);
          onImpact({ position: housePos, type: "houseBurned" });
          onBurn(walkerOwner.faction);
          // See KnightCooldown's doc comment / knightTargetingSystem — without
          // this a knight instantly marches on to its next-nearest target.
          world.add(walkerEntity, KnightCooldown, { remaining: KNIGHT_BURN_COOLDOWN });
          break;
        }

        const house = world.get(houseEntity, House)!;
        if (walker.strength > HOUSE_LEVELS[house.level].defense) {
          world.add(houseEntity, Owner, { faction: walkerOwner.faction });
          world.add(houseEntity, House, { level: house.level, population: 0 });
          onImpact({ position: housePos, type: "houseCaptured" });
          onCapture(walkerOwner.faction);
        } else {
          onImpact({ position: walkerPos, type: "combatDeath" });
        }

        world.destroyEntity(walkerEntity);
        break;
      }
    }
  };
}
