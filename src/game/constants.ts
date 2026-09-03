import type { HouseLevel } from "./components";

/** Tiles per second for a freshly spawned walker. */
export const DEFAULT_WALKER_SPEED = 1.5;

/** Radius (in tiles) a "seeking" walker without a target wanders within. */
export const DEFAULT_WANDER_RADIUS = 6;

/** Population units a house accumulates per second. */
export const DEFAULT_POPULATION_GROWTH_RATE = 2;

/**
 * Capacity, mana output, and defense per house level. Level-up itself is
 * driven by surrounding terrain flatness per docs/game-system.md and is
 * not yet implemented (it needs the heightmap wired into the ECS) — for
 * now every house stays at "hut" and only the population/spawn loop runs.
 */
export const HOUSE_LEVELS: Record<HouseLevel, { capacity: number; manaRate: number; defense: number }> = {
  hut: { capacity: 10, manaRate: 1, defense: 3 },
  lodge: { capacity: 20, manaRate: 3, defense: 6 },
  manor: { capacity: 35, manaRate: 6, defense: 12 },
  castle: { capacity: 60, manaRate: 12, defense: 20 },
};

/** A walker and an enemy walker/house within this many tiles fight it out. */
export const COMBAT_RANGE = 0.5;

/**
 * Placeholder land-scarcity proxy: roughly how many map tiles a faction
 * needs per house it's allowed to build, used to derive
 * HouseGrowthConfig.maxHousesPerFaction from world size until real
 * terrain-based flat-land scarcity is implemented.
 */
export const TILES_PER_HOUSE_CAP = 8;
