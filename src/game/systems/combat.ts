import type { Entity, System, World } from "../../ecs";
import { ADONIS_MIN_SPLIT_STRENGTH, ADONIS_SPLIT_GAP, COMBAT_RANGE, HERO_ACTION_COOLDOWN, HOUSE_LEVELS } from "../constants";
import { Charmed, HeroCooldown, House, Owner, Position, Walker, isAdvancingHeroState, type FactionId } from "../components";
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
        // Someone トロイのヘレン is holding is 拘束 — bound, walked away,
        // and out of the fight entirely. They are still the enemy's people
        // (they are not converted), they are simply not fighting for them.
        if (world.has(a, Charmed) || world.has(b, Charmed)) continue;

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

  // トロイのヘレン 「敵と戦わない」 (docs/original-miracles.md #28). Not
  // "wins without fighting" and not "cannot be touched": she deals no
  // damage at all and dies to anyone who reaches her, whatever their
  // strength. That is the risk her charm is meant to keep her out of —
  // HELEN_CHARM_RADIUS is six times COMBAT_RANGE, so an approaching walker
  // is normally taken long before it arrives, and only the one she has no
  // room left for gets through.
  const helenA = walkerA.state === "helen";
  const helenB = walkerB.state === "helen";
  if (helenA || helenB) {
    if (helenA) {
      world.destroyEntity(a);
      onImpact({ position: posA, type: "combatDeath" });
    }
    if (helenB) {
      world.destroyEntity(b);
      onImpact({ position: posB, type: "combatDeath" });
    }
    return;
  }

  if (walkerA.strength > walkerB.strength) {
    world.add(a, Walker, { ...walkerA, strength: walkerA.strength - walkerB.strength });
    world.destroyEntity(b);
    onImpact({ position: posB, type: "combatDeath" });
    splitAdonis(world, a);
  } else if (walkerB.strength > walkerA.strength) {
    world.add(b, Walker, { ...walkerB, strength: walkerB.strength - walkerA.strength });
    world.destroyEntity(a);
    onImpact({ position: posA, type: "combatDeath" });
    splitAdonis(world, b);
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
  /** Called when an attacking hero burns a house down instead of capturing it. */
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
 * Heroes (see isHeroState) are the exceptions:
 * - An attacking hero (see ADVANCING_HERO_KINDS), per docs/game-system.md
 *   "敵の...家を（奪わず）焼き払う",
 *   burns the house down (destroys it outright, regardless of defense)
 *   rather than capturing it, and survives to keep marching
 *   ("指示に依存せず戦い続ける").
 * - A guardian captures normally (still checked against the house's
 *   defense, still repelled and consumed on failure like any regular
 *   walker) but survives a successful capture instead of being consumed by
 *   it — a defender that holds what it takes rather than a raider that
 *   burns and moves on.
 * Every hero gets a HeroCooldown after resolving a house — see that
 * component's doc comment.
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
      // トロイのヘレン 「敵と戦わない」 — she has no way to hurt a house
      // and must not be consumed capturing one; and anyone she is holding
      // is 拘束, not free to storm a building on the way past.
      if (walker.state === "helen" || world.has(walkerEntity, Charmed)) continue;

      for (const houseEntity of world.query(Position, House, Owner)) {
        const houseOwner = world.get(houseEntity, Owner)!;
        if (houseOwner.faction === walkerOwner.faction) continue;
        const housePos = world.get(houseEntity, Position)!;
        if (!withinRange(walkerPos, housePos)) continue;

        if (isAdvancingHeroState(walker.state)) {
          world.destroyEntity(houseEntity);
          onImpact({ position: housePos, type: "houseBurned" });
          onBurn(walkerOwner.faction);
          // See HeroCooldown's doc comment / heroAdvanceTargetingSystem —
          // without this a hero instantly marches on to its next target.
          world.add(walkerEntity, HeroCooldown, { remaining: HERO_ACTION_COOLDOWN });
          break;
        }

        const house = world.get(houseEntity, House)!;
        if (walker.strength > HOUSE_LEVELS[house.level].defense) {
          world.add(houseEntity, Owner, { faction: walkerOwner.faction });
          world.add(houseEntity, House, { level: house.level, population: 0 });
          onImpact({ position: housePos, type: "houseCaptured" });
          onCapture(walkerOwner.faction);

          if (walker.state === "guardian") {
            // See HeroCooldown's doc comment / guardianTargetingSystem —
            // without this a guardian instantly marches on to capture its
            // next-nearest threatened target.
            world.add(walkerEntity, HeroCooldown, { remaining: HERO_ACTION_COOLDOWN });
          } else {
            world.destroyEntity(walkerEntity);
          }
        } else {
          onImpact({ position: walkerPos, type: "combatDeath" });
          world.destroyEntity(walkerEntity);
        }

        break;
      }
    }
  };
}

/**
 * アドニス's own rule: 「戦闘に勝つと2体に分裂する（分裂後は体力が半分）」
 * (docs/original-miracles.md #10). Called on the winner of a walker fight;
 * a no-op for every other kind of walker.
 *
 * The copy is a full アドニス, so it splits again on its own next win —
 * that runaway is the miracle, and what holds it in check is that every
 * body is weaker than the last and each one that dies costs its faction
 * HERO_DEATH_MANA_LOSS (see systems/heroLoss.ts). 「増やしすぎは英雄死亡
 * 時のマナ損失というリスクを伴う」.
 *
 * The two halves are nudged apart along the x axis. Left exactly on top of
 * each other they would read as one hero, and — worse — would be caught by
 * the same swamp, the same crevice and the same gust for the rest of the
 * match, which is the opposite of what splitting is for.
 *
 * A split below ADONIS_MIN_SPLIT_STRENGTH is skipped: halving forever
 * produces an unbounded crowd of heroes too weak to beat anything, each
 * still costing mana when it dies.
 */
function splitAdonis(world: World, winner: Entity): void {
  const walker = world.get(winner, Walker)!;
  if (walker.state !== "adonis") return;
  if (walker.strength < ADONIS_MIN_SPLIT_STRENGTH) return;

  const half = walker.strength / 2;
  const pos = world.get(winner, Position)!;
  const owner = world.get(winner, Owner)!;

  world.add(winner, Walker, { ...walker, strength: half });
  world.add(winner, Position, { x: pos.x - ADONIS_SPLIT_GAP / 2, y: pos.y });

  const copy = world.createEntity();
  world.add(copy, Position, { x: pos.x + ADONIS_SPLIT_GAP / 2, y: pos.y });
  world.add(copy, Owner, { faction: owner.faction });
  world.add(copy, Walker, { ...walker, strength: half });
}
