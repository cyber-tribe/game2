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

export const Position = defineComponent<Position>("Position");
export const Owner = defineComponent<Owner>("Owner");
export const Walker = defineComponent<Walker>("Walker");
export const MoveTarget = defineComponent<MoveTarget>("MoveTarget");
export const House = defineComponent<House>("House");
