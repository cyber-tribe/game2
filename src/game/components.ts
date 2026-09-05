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
 * "seeking", "knight", and "guardian" are driven by systems in this slice:
 * "knight" via knightTargetingSystem (hunts anywhere, burns houses),
 * "guardian" via guardianTargetingSystem (only engages threats near its own
 * faction's houses, captures normally) — both also get special-cased
 * handling in swampSystem/houseCaptureSystem, see isHeroState below.
 * "traveling" and "fighting" remain placeholders.
 */
export type WalkerState = "seeking" | "traveling" | "fighting" | "knight" | "guardian";

/** Every WalkerState that promoteHero (hero.ts) can produce — see isHeroState. */
const HERO_WALKER_STATES: readonly WalkerState[] = ["knight", "guardian"];

/**
 * Whether `state` is one of the hero states (see HERO_WALKER_STATES) —
 * shared by swampSystem (hero swamp immunity) and houseCaptureSystem
 * (hero-specific capture/burn rules) so both stay in sync with whatever
 * hero kinds promoteHero actually produces, rather than each hardcoding
 * its own "knight" check.
 */
export function isHeroState(state: WalkerState): boolean {
  return HERO_WALKER_STATES.includes(state);
}

export interface Walker {
  /** Internal head-count / combat power this walker represents. */
  strength: number;
  state: WalkerState;
  /** Tiles per second. */
  speed: number;
}

/** Where a Position-having entity is currently walking to. Removed on arrival. */
export interface MoveTarget {
  x: number;
  y: number;
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
export const HeroCooldown = defineComponent<HeroCooldown>("HeroCooldown");
