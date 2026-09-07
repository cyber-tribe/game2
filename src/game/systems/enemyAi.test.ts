import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, House, Owner, Position, Walker, type FactionId } from "../components";
import { createFaction } from "../faction";
import { createEnemyAiSystem } from "./enemyAi";

function addWalkers(world: World, count: number): void {
  for (let i = 0; i < count; i++) {
    const entity = world.createEntity();
    world.add(entity, Owner, { faction: "enemy" });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  }
}

function addHouse(world: World, faction: FactionId, x: number, y: number): void {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population: 0 });
}

function addWalkerAt(world: World, faction: FactionId, x: number, y: number): void {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
}

describe("createEnemyAiSystem", () => {
  /**
   * `economyFloor: 0` throughout this block: these tests are about *when*
   * the AI decides and what the walker count does to that decision, and
   * none of them builds the faction a settlement. The floor itself has
   * its own tests at the bottom of the file.
   */
  it("decides immediately on the first call rather than waiting out a full interval", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 10);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 0 });
    system(world, 0.001);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("does not re-decide again until a full interval has elapsed since the last decision", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    addWalkers(world, 10);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 0 });
    system(world, 0.001); // first call always decides; 10 walkers -> stays "fight"

    for (const entity of world.query(Walker, Owner)) world.destroyEntity(entity);
    system(world, 4); // interval not yet elapsed since the first decision

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("switches to fight mode once the walker count reaches the aggression threshold", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 5);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 0 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("gathers (to build a leader) below the aggression threshold when it has no leader yet", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    addWalkers(world, 1);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 0 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("gather");
  });

  it("settles instead of gathering below the aggression threshold once it already has a leader", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    addWalkers(world, 1);
    const [leader] = world.query(Walker, Owner);
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, leaderId: leader });

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 0 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("settle");
  });

  it("re-evaluates again after each subsequent interval", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 5);

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 0 });
    system(world, 5);
    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");

    for (const entity of world.query(Walker, Owner)) world.destroyEntity(entity);

    system(world, 4); // not yet due
    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");

    system(world, 1); // now due, walker count is 0, and it never had a leader
    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("gather");
  });

  it("does nothing when the target faction doesn't exist", () => {
    const world = new World();
    const system = createEnemyAiSystem({ decisionInterval: 5, economyFloor: 0 });

    expect(() => system(world, 5)).not.toThrow();
  });

  it("switches to fight mode when an opponent walker nears one of its houses, even below the aggression threshold", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 1); // well below the aggression threshold
    addHouse(world, "enemy", 10, 10);
    addWalkerAt(world, "player", 12, 10); // within the default threat radius

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, threatRadius: 4, economyFloor: 0 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("gathers instead of fighting when an opponent walker is far from every house", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    addWalkers(world, 1);
    addHouse(world, "enemy", 10, 10);
    addWalkerAt(world, "player", 50, 50); // far outside the threat radius

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, threatRadius: 4, economyFloor: 0 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("gather");
  });

  /**
   * The rule the rest of this block opts out of — see
   * ENEMY_AI_ECONOMY_FLOOR. "fight" is faction-wide, so a faction that
   * marches before it has built anything never builds anything.
   */
  it("keeps building instead of marching while it has no settlement to march from", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 10); // well past the aggression threshold
    addHouse(world, "enemy", 10, 10);
    const [leader] = world.query(Walker, Owner);
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, leaderId: leader });

    createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 3 })(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("settle");
  });

  it("marches once the settlement is big enough", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 10);
    for (let i = 0; i < 3; i++) addHouse(world, "enemy", 10 + i, 10);

    createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 3 })(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  /** A faction that answers a raid by carrying on building loses either way. */
  it("defends a house under attack however small its settlement is", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    addWalkers(world, 1); // below the aggression threshold too
    addHouse(world, "enemy", 10, 10);
    addWalkerAt(world, "player", 12, 10);

    createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, threatRadius: 4, economyFloor: 99 })(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("fight");
  });

  it("never overrides behaviorMode once finalBattle is set, even past the aggression threshold", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "goToShrine");
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, finalBattle: true });
    addWalkers(world, 10); // would normally force "fight"

    const system = createEnemyAiSystem({ decisionInterval: 5, aggressionThreshold: 4, economyFloor: 0 });
    system(world, 5);

    expect(world.get(enemy, FactionState)!.behaviorMode).toBe("goToShrine");
  });
});
