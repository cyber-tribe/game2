import { defineComponent, type Entity } from "../ecs";

export type FactionId = "player" | "enemy";

export interface Position {
  x: number;
  y: number;
}

export interface Owner {
  faction: FactionId;
}

/**
 * Which hero a promoted leader has become — see hero.ts's promoteHero and
 * HERO_TRAITS in constants.ts.
 *
 * The four named ones are the original's own heroes
 * (docs/original-miracles.md #3/#15/#19/#23), one per element, and they
 * exist as separate kinds because each carries a *different* rule rather
 * than a different number:
 *
 * - "perseus" — 「標準的な戦闘型で、敵地へ進んで攻撃する基準の英雄」.
 *   This is exactly what game2 called 騎士 before they had names, kept
 *   unchanged so the baseline it is the baseline *of* stays put.
 * - "hercules" — 「戦闘力が最も高い。地割れに落ちない」. The counter to
 *   an earthquake's crevice (systems/crevice.ts).
 * - "odysseus" — 「移動速度が速い」. Compounds with a road
 *   (systems/movement.ts), which is the only other thing that moves a
 *   walker faster.
 * - "achilles" — 「火が効かず焼死しない」. The counter to fire rain, and
 *   so to a forest turned against its owner (game/fire.ts).
 *
 * "guardian" is game2's own, not the original's — a defensive hero that
 * only engages threats near its own houses (see guardianTargetingSystem).
 * The original has no such hero, but removing a working miracle to match a
 * roster would be a loss, so it stays alongside them, like 平坦化 does
 * among the terrain tools.
 */
export type HeroKind = "perseus" | "hercules" | "odysseus" | "achilles" | "guardian";

/**
 * "seeking" and the hero kinds are driven by systems in this slice: the
 * four attacking heroes via heroAdvanceTargetingSystem (hunt anywhere, burn
 * houses), "guardian" via guardianTargetingSystem (only engages threats near
 * its own faction's houses, captures normally) — both also get special-cased
 * handling in houseCaptureSystem and drowning.ts's open-water immunity,
 * see isHeroState below. "traveling" and "fighting" remain placeholders.
 */
export type WalkerState = "seeking" | "traveling" | "fighting" | HeroKind;

/** Every HeroKind, in the order the toolbar lists them. */
export const HERO_KINDS: readonly HeroKind[] = ["perseus", "hercules", "odysseus", "achilles", "guardian"];

/**
 * The attacking heroes: every kind that marches on the enemy and burns
 * what it reaches, i.e. all of the original's own four. Kept as its own
 * list rather than "everything except guardian" so that adding アドニス
 * (#10) or トロイのヘレン (#28) — neither of which behaves like either —
 * is a matter of deciding which list they join, not of discovering that
 * the negation quietly swept them up.
 */
export const ADVANCING_HERO_KINDS: readonly HeroKind[] = ["perseus", "hercules", "odysseus", "achilles"];

/** Whether `state` is an attacking hero — see ADVANCING_HERO_KINDS. */
export function isAdvancingHeroState(state: WalkerState): boolean {
  return (ADVANCING_HERO_KINDS as readonly string[]).includes(state);
}

/**
 * Whether `state` is one of the hero states (see HERO_KINDS) —
 * shared by houseCaptureSystem (hero-specific capture/burn rules) and
 * drowning.ts (open-water immunity) so both stay in sync with whatever
 * hero kinds promoteHero actually produces, rather than each hardcoding
 * its own per-kind check. Notably NOT used by swampSystem: heroes drown
 * in swamps just like anyone else.
 */
export function isHeroState(state: WalkerState): boolean {
  return (HERO_KINDS as readonly string[]).includes(state);
}

export interface Walker {
  /** Internal head-count / combat power this walker represents. */
  strength: number;
  state: WalkerState;
  /** Tiles per second. */
  speed: number;
  /**
   * What this walker's strength and speed were before any hero miracle
   * multiplied them (see hero.ts's promoteHero and HERO_TRAITS). Absent on
   * a walker that has never been promoted.
   *
   * Kept so re-specializing from one hero to another re-derives both
   * numbers from the same base instead of compounding: without it, a
   * leader cycled ヘラクレス → オディッセウス → ヘラクレス would come out
   * four times as strong as one that was simply cast ヘラクレス once, and
   * the cheapest path to the strongest hero would be to buy every other
   * hero first.
   */
  heroBase?: { strength: number; speed: number };
}

/** Where a Position-having entity is currently walking to. Removed on arrival. */
export interface MoveTarget {
  x: number;
  y: number;
}

/**
 * Attached to a Walker only while it's standing in a genuine body of water
 * (see world/heightmap.ts's isInWaterPool) — see systems/drowning.ts, the
 * only reader/writer. `breath` counts down each tick it stays submerged;
 * reaching dry land removes this component outright (full, instant
 * recovery — per feedback: "陸に上がると普段の動きに戻る"), rather than
 * the breath just pausing where it was.
 */
export interface Drowning {
  breath: number;
}

export type HouseLevel = "hut" | "lodge" | "manor" | "castle";

export interface House {
  level: HouseLevel;
  /** Accumulated population; spawns a walker and resets once it hits capacity. */
  population: number;
}

/**
 * The four influence modes from docs/game-system.md, all enforced by
 * dedicated systems: "settle" (the wander/settle systems' implicit
 * default), "gather" (gatherTargetingSystem + gatherSystem — also the only
 * mode leaderSystem promotes a leader under), "fight" (fightTargetingSystem),
 * and "goToShrine" (goToShrineSystem).
 */
export type BehaviorMode = "settle" | "gather" | "goToShrine" | "fight";

/**
 * One FactionState entity per side. Mana is the only resource spent on
 * miracles; behaviorMode/shrinePosition steer the gather/goToShrine/fight
 * walker systems. leaderId is maintained by leaderSystem, which — only
 * while behaviorMode is "gather" — promotes whichever of this faction's
 * walkers is first to arrive at the shrine; it isn't set at faction
 * creation and stays unset under every other mode until gather produces
 * one. finalBattle is set once by the "最終決戦" miracle and, once true,
 * makes createEnemyAiSystem stop overriding behaviorMode — there is no
 * walking it back.
 */
export interface FactionState {
  id: FactionId;
  mana: number;
  behaviorMode: BehaviorMode;
  shrinePosition: Position;
  leaderId?: Entity;
  finalBattle?: boolean;
}

/**
 * A hazard placed at a Position: any walker that wanders within `radius`
 * drowns. Consumes one unit of `remainingCapacity` per walker swallowed
 * and disappears once it hits zero — per docs/game-system.md, "一定数を
 * 飲み込むと消えるタイプ". The permanent variant isn't implemented.
 */
export interface Swamp {
  radius: number;
  remainingCapacity: number;
}

/**
 * The original's 聖水の泉 (docs/original-miracles.md #27): 「落ちた信者が
 * 敵側へ寝返る。英雄まで寝返る可能性があり、強い英雄を奪えば形勢逆転できる。
 * 再度落ちると元へ戻る場合もある」.
 *
 * Shaped like a Swamp on purpose — a radius and a capacity — because it is
 * the same kind of thing: a patch of ground that does something to whoever
 * walks into it, a fixed number of times, and then is gone. What differs is
 * only that a swamp deletes them and a spring takes them.
 *
 * The spring's own Owner is which side converts walkers walk out as, so
 * "再度落ちると元へ戻る" needs no rule of its own: a walker taken by the
 * player's spring and then wandering into the enemy's changes sides again,
 * because each spring only ever converts walkers that are not already its
 * owner's.
 */
export interface HolyWater {
  radius: number;
  remainingCapacity: number;
}

/**
 * A brief rest a hero takes right after resolving a house — a knight
 * burning it, or a guardian capturing one — before its targeting system
 * will send it marching after its next target. See knightTargetingSystem/
 * guardianTargetingSystem's doc comments for why this exists. Only ever
 * attached to a hero-state Walker (see isHeroState); removed once
 * `remaining` counts down to 0.
 */
export interface HeroCooldown {
  remaining: number;
}

export const Position = defineComponent<Position>("Position");
export const Owner = defineComponent<Owner>("Owner");
export const Walker = defineComponent<Walker>("Walker");
export const MoveTarget = defineComponent<MoveTarget>("MoveTarget");
export const House = defineComponent<House>("House");
export const FactionState = defineComponent<FactionState>("FactionState");
export const Swamp = defineComponent<Swamp>("Swamp");
export const HolyWater = defineComponent<HolyWater>("HolyWater");
export const HeroCooldown = defineComponent<HeroCooldown>("HeroCooldown");
export const Drowning = defineComponent<Drowning>("Drowning");
