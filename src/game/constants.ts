import type { HouseLevel } from "./components";

/** Tiles per second for a freshly spawned walker. */
export const DEFAULT_WALKER_SPEED = 1.5;

/** Radius (in tiles) a "seeking" walker without a target wanders within. */
export const DEFAULT_WANDER_RADIUS = 6;

/** Population units a house accumulates per second. */
export const DEFAULT_POPULATION_GROWTH_RATE = 2;

/**
 * Capacity and mana output per house level. Level-up itself is driven by
 * surrounding terrain flatness per docs/game-system.md and is not yet
 * implemented (it needs the heightmap wired into the ECS) — for now every
 * house stays at "hut" and only the population/spawn loop runs.
 */
export const HOUSE_LEVELS: Record<HouseLevel, { capacity: number; manaRate: number }> = {
  hut: { capacity: 10, manaRate: 1 },
  lodge: { capacity: 20, manaRate: 3 },
  manor: { capacity: 35, manaRate: 6 },
  castle: { capacity: 60, manaRate: 12 },
};
