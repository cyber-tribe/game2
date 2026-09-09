import type { Entity, System, World } from "../../ecs";
import { ADONIS_MIN_SPLIT_STRENGTH, ADONIS_SPLIT_GAP, COMBAT_RANGE, HERO_ACTION_COOLDOWN, HOUSE_LEVELS } from "../constants";
import { Charmed, HeroCooldown, House, Owner, Position, Walker, isAdvancingHeroState, type FactionId } from "../components";
import { isShieldedAtMagnet } from "../protection";
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
        // 「リーダーがマグネットに到達すると…青い炎に包まれます(この間は
        // 無敵状態になります)」 — a leader waiting at its own flag under
        // 集合 cannot be fought either. See protection.ts.
        if (isShieldedAtMagnet(world, a) || isShieldedAtMagnet(world, b)) continue;

        resolveWalkerFight(world, a, b, onImpact);
        if (!world.isAlive(a)) break;
      }
    }
  };
}

function resolveWalkerFight(
  world: World,
  a: Entity,
  b: Entity,
  onImpact: OnImpactEffect,
): void {
  const walkerA = world.get(a, Walker)!;
  const walkerB = world.get(b, Walker)!;
  const posA = world.get(a, Position)!;
  const posB = world.get(b, Position)!;

  // トロイのヘレン: 「戦闘することが出来ず、**神業でしか潰せない**」. She
  // deals no damage and takes none — a fight involving her simply does not
  // happen, and both sides walk on.
  //
  // This used to kill her instead, reading 「敵と戦わない」 as "cannot win a
  // fight" rather than "cannot be in one". The original article is explicit
  // that only a miracle can end her, and the difference is what she is for:
  // killable by contact, she is a fragile unit the enemy answers by walking
  // one spare follower at her, and the charm becomes a delaying tactic.
  // Untouchable by hand, she is a problem the enemy *god* has to spend
  // mana on — which is exactly the pressure the miracle is meant to apply.
  //
  // Nothing else changes: every miracle that destroys a walker does so
  // directly rather than through this function, so 雷, 火の雨, 沼, 地割れ,
  // 竜巻 and the rest still take her. 神業でしか潰せない, precisely.
  if (walkerA.state === "helen" || walkerB.state === "helen") return;

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
      // トロイのヘレン 「戦闘することが出来ず」 — she has no way to hurt a
      // house and must not be consumed capturing one; and anyone she is
      // holding is 拘束, not free to storm a building on the way past
      // (what the charmed *do* pull down is their own side's houses, and
      // systems/helen.ts is where that happens).
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
        const defense = HOUSE_LEVELS[house.level].defense;
        if (walker.strength > defense) {
          world.add(houseEntity, Owner, { faction: walkerOwner.faction });
          world.add(houseEntity, House, { level: house.level, population: 0 });
          onImpact({ position: housePos, type: "houseCaptured" });
          onCapture(walkerOwner.faction);

          if (walker.state === "guardian") {
            // See HeroCooldown's doc comment / guardianTargetingSystem —
            // without this a guardian instantly marches on to capture its
            // next-nearest threatened target. A guardian also takes the
            // house for nothing, which is now the whole of what makes it
            // different from anyone else who captures one.
            world.add(walkerEntity, HeroCooldown, { remaining: HERO_ACTION_COOLDOWN });
          } else {
            // The storming costs what the house was worth to defend, and
            // the rest of the group walks out the other side — the same
            // arithmetic resolveWalkerFight already uses when two walkers
            // meet ("the stronger one survives with its strength reduced
            // by the loser's"). A walker is a group, not a person
            // (docs/game-system.md 4節: 「見た目は1人でも実際は集団を
            // 表す」), so an army of fifty spending itself entirely on one
            // hut was never consistent with the rest of this model — and
            // it is what made a ground war impossible to sustain: one
            // mustered force, one house, start again.
            world.add(walkerEntity, Walker, { ...walker, strength: walker.strength - defense });
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
