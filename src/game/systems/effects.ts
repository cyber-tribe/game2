import type { Point } from "./geometry";

/**
 * Which kind of violent moment an ImpactEffectEvent is reporting — purely
 * cosmetic (EntityLayer picks a color/shape per type); nothing in game
 * logic branches on it.
 */
export type ImpactEffectType = "combatDeath" | "houseCaptured" | "houseBurned" | "drowned";

/** One kill/capture/drowning worth reporting visually, and where it happened. */
export interface ImpactEffectEvent {
  position: Point;
  type: ImpactEffectType;
}

/**
 * Reported by combat/swamp/flood wherever something is destroyed or
 * captured, so the player sees *something* happen at that spot instead of
 * an entity just quietly vanishing. Deliberately NOT modeled as ECS
 * entities/components: World recycles entity ids the instant one is freed
 * (see World.createEntity's freeIds), so spawning a new entity as a side
 * effect of destroying an old one — however carefully ordered — risks
 * handing the new entity an id a caller elsewhere in the same pass (or a
 * test) still holds a stale handle to, making its world.isAlive(oldHandle)
 * check misfire. A plain callback sidesteps that entirely; Simulation
 * collects the events into its own plain array (see impactEffects) the
 * same way it already does for MatchEvent.
 */
export type OnImpactEffect = (event: ImpactEffectEvent) => void;

/** An ImpactEffectEvent plus how long ago it happened — see Simulation.impactEffects. */
export interface ImpactEffectSnapshot extends ImpactEffectEvent {
  /** Seconds since this effect was recorded. */
  age: number;
}
