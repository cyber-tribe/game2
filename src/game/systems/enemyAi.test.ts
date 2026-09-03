import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, Owner, Walker } from "../components";
import { createFaction } from "../faction";
import { createEnemyAiSystem } from "./enemyAi";

function addWalkers(world: World, count: number): void {
  for (let i = 0; i < count; i++) {
    const entity = world.createEntity();
    world.add(entity, Owner, { faction: "enemy" });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  }
}

describe("createEnemyAiSystem", () => {
  it("decides immediately on the first call rather than waiting out a full interval", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 10);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4 });
    system(world, 0.001);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("does not re-decide again until a full interval has elapsed since the last decision", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    addWalkers(world, 10);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4 });
    system(world, 0.001); // first call always decides; 10 walkers -> stays "fight"

    for (const entity of world.query(Walker, Owner)) world.destroyEntity(entity);
    system(world, 4); // interval not yet elapsed since the first decision

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("switches to fight mode once the walker count reaches the aggression threshold", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 5);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("stays in settle mode below the aggression threshold", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    addWalkers(world, 1);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("settle");
  });

  it("re-evaluates again after each subsequent interval", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 5);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4 });
    system(world, 5);
    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");

    for (const entity of world.query(Walker, Owner)) world.destroyEntity(entity);

    system(world, 4); // not yet due
    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");

    system(world, 1); // now due, walker count is 0
    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("settle");
  });

  it("does nothing when the target faction doesn't exist", () => {
    const world = new World();
    const system = createEnemyAiSystem({ decisionInterval: 5 });

    expect(() => system(world, 5)).not.toThrow();
  });
});
