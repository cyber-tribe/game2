import type { World } from "../ecs";
import { FactionState, House, Owner, Position, Walker } from "./components";
import { FINAL_BATTLE_WALKER_SPEED, HOUSE_LEVELS } from "./constants";
import type { Point } from "./systems/geometry";

/**
 * The "最終決戦" miracle: both factions abandon every house and march
 * everyone to the world's center for a final, all-out fight — per
 * docs/game-system.md, "両陣営の集結シンボルが世界の中央へ移動し、全ての
 * 民が家を捨てて中央に集まり、総力戦を行う". Unlike every other miracle,
 * it isn't scoped to the caster's faction: both sides' shrinePosition move
 * to `center` and both are switched to "goToShrine" mode, so the
 * already-implemented leader/goToShrine machinery does the marching.
 * Whichever faction still has walkers or houses once the dust settles
 * wins, per Simulation.getOutcome() — no separate winner-detection logic
 * is needed. finalBattle is also set so createEnemyAiSystem's periodic
 * behaviorMode override can't undo the march once it's begun.
 */
export function triggerArmageddon(world: World, center: Point): void {
  for (const entity of world.query(House, Owner, Position)) {
    const house = world.get(entity, House)!;
    const owner = world.get(entity, Owner)!;
    const pos = world.get(entity, Position)!;
    world.destroyEntity(entity);

    const walker = world.createEntity();
    world.add(walker, Position, { x: pos.x, y: pos.y });
    world.add(walker, Owner, { faction: owner.faction });
    world.add(walker, Walker, {
      strength: HOUSE_LEVELS[house.level].defense,
      state: "seeking",
      speed: FINAL_BATTLE_WALKER_SPEED,
    });
  }

  // Every walker marches at FINAL_BATTLE_WALKER_SPEED for this battle —
  // including ones that already existed before armageddon was cast, not
  // just the ones just converted above — see FINAL_BATTLE_WALKER_SPEED's
  // doc comment for why.
  for (const entity of world.query(Walker)) {
    const walker = world.get(entity, Walker)!;
    world.add(entity, Walker, { ...walker, speed: FINAL_BATTLE_WALKER_SPEED });
  }

  for (const factionEntity of world.query(FactionState)) {
    const state = world.get(factionEntity, FactionState)!;
    world.add(factionEntity, FactionState, {
      ...state,
      shrinePosition: center,
      behaviorMode: "goToShrine",
      finalBattle: true,
    });
  }
}
