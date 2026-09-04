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
 * "seeking" and "knight" are driven by systems in this slice ("knight" via
 * knightTargetingSystem, plus special-cased handling in swampSystem/
 * houseCaptureSystem). "traveling" and "fighting" remain placeholders.
 */
export type WalkerState = "seeking" | "traveling" | "fighting" | "knight";

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
 * default), "gather" (gatherSystem), "fight" (fightTargetingSystem), and
 * "goToShrine" (leaderSystem + goToShrineSystem).
 */
export type BehaviorMode = "settle" | "gather" | "goToShrine" | "fight";

/**
 * One FactionState entity per side. Mana is the only resource spent on
 * miracles; behaviorMode/shrinePosition steer the gather/goToShrine/fight
 * walker systems. leaderId is maintained by leaderSystem, which promotes
 * a live walker of this faction whenever the slot is empty — it isn't set
 * at faction creation. finalBattle is set once by the "最終決戦" miracle
 * and, once true, makes createEnemyAiSystem stop overriding behaviorMode —
 * there is no walking it back.
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
 * A brief rest a knight takes right after burning a house, before
 * knightTargetingSystem will send it marching after its next target — see
 * that system's doc comment for why this exists. Only ever attached to a
 * "knight"-state Walker; removed once `remaining` counts down to 0.
 */
export interface KnightCooldown {
  remaining: number;
}

export const Position = defineComponent<Position>("Position");
export const Owner = defineComponent<Owner>("Owner");
export const Walker = defineComponent<Walker>("Walker");
export const MoveTarget = defineComponent<MoveTarget>("MoveTarget");
export const House = defineComponent<House>("House");
export const FactionState = defineComponent<FactionState>("FactionState");
export const Swamp = defineComponent<Swamp>("Swamp");
export const KnightCooldown = defineComponent<KnightCooldown>("KnightCooldown");
