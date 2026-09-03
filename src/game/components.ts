import { defineComponent } from "../ecs";

export type FactionId = "player" | "enemy";

export interface Position {
  x: number;
  y: number;
}

export interface Owner {
  faction: FactionId;
}

/**
 * Only "seeking" and "traveling" are driven by systems in this slice.
 * "fighting" and "knight" are placeholders for the combat/miracle work
 * described in docs/game-system.md and are not yet acted on.
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
 * The four influence modes from docs/game-system.md. Only "settle" is
 * acted on so far (it's the implicit default the wander/settle systems
 * already assume); "gather"/"goToShrine"/"fight" are recorded but not
 * yet enforced.
 */
export type BehaviorMode = "settle" | "gather" | "goToShrine" | "fight";

/**
 * One FactionState entity per side. Mana is the only resource spent on
 * miracles; behaviorMode/shrinePosition steer the (not yet implemented)
 * gather/goToShrine/fight walker systems.
 */
export interface FactionState {
  id: FactionId;
  mana: number;
  behaviorMode: BehaviorMode;
  shrinePosition: Position;
}

export const Position = defineComponent<Position>("Position");
export const Owner = defineComponent<Owner>("Owner");
export const Walker = defineComponent<Walker>("Walker");
export const MoveTarget = defineComponent<MoveTarget>("MoveTarget");
export const House = defineComponent<House>("House");
export const FactionState = defineComponent<FactionState>("FactionState");
