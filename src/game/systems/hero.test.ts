import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { ADVANCING_HERO_KINDS, HeroCooldown, House, MoveTarget, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { createFaction } from "../faction";
import { guardianTargetingSystem, heroCooldownSystem, heroAdvanceTargetingSystem } from "./hero";

function createWalker(world: World, faction: FactionId, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

function createHouse(world: World, faction: FactionId, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

describe("heroAdvanceTargetingSystem", () => {
  it("sends a target-less hero toward the nearest enemy walker, regardless of behaviorMode", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "settle"); // not "fight"
    const hero = createWalker(world, "player", 0, 0, "perseus");
    createWalker(world, "enemy", 20, 20);
    createWalker(world, "enemy", 5, 0);

    heroAdvanceTargetingSystem(world, 0);

    expect(world.get(hero, MoveTarget)).toEqual({ x: 5, y: 0 });
  });

  it("targets an enemy house when it's the nearest enemy target", () => {
    const world = new World();
    const hero = createWalker(world, "player", 0, 0, "perseus");
    createHouse(world, "enemy", 2, 0);

    heroAdvanceTargetingSystem(world, 0);

    expect(world.get(hero, MoveTarget)).toEqual({ x: 2, y: 0 });
  });

  it("ignores non-hero walkers entirely", () => {
    const world = new World();
    const walker = createWalker(world, "player", 0, 0, "seeking");
    createWalker(world, "enemy", 5, 0);

    heroAdvanceTargetingSystem(world, 0);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("does not override a hero that already has a target", () => {
    const world = new World();
    const hero = createWalker(world, "player", 0, 0, "perseus");
    world.add(hero, MoveTarget, { x: 99, y: 99 });
    createWalker(world, "enemy", 5, 0);

    heroAdvanceTargetingSystem(world, 0);

    expect(world.get(hero, MoveTarget)).toEqual({ x: 99, y: 99 });
  });

  it("leaves a hero without a target when there is nothing to fight", () => {
    const world = new World();
    const hero = createWalker(world, "player", 0, 0, "perseus");

    heroAdvanceTargetingSystem(world, 0);

    expect(world.has(hero, MoveTarget)).toBe(false);
  });

  it("does not retarget a hero that's still resting under HeroCooldown", () => {
    const world = new World();
    const hero = createWalker(world, "player", 0, 0, "perseus");
    world.add(hero, HeroCooldown, { remaining: 3 });
    createWalker(world, "enemy", 5, 0);

    heroAdvanceTargetingSystem(world, 0);

    expect(world.has(hero, MoveTarget)).toBe(false);
  });

  it("ignores guardians entirely, even with an enemy within range", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 0, 0, "guardian");
    createHouse(world, "player", 0, 0);
    createWalker(world, "enemy", 1, 0);

    heroAdvanceTargetingSystem(world, 0);

    expect(world.has(guardian, MoveTarget)).toBe(false);
  });
});

describe("guardianTargetingSystem", () => {
  it("engages an enemy walker within GUARDIAN_DEFENSE_RADIUS of one of its own houses", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 10, 10, "guardian");
    createHouse(world, "player", 0, 0);
    const enemy = createWalker(world, "enemy", 1, 0); // within radius of the (0,0) house

    guardianTargetingSystem(world, 0);

    expect(world.get(guardian, MoveTarget)).toEqual(world.get(enemy, Position));
  });

  it("engages an enemy house within range of one of its own houses", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 10, 10, "guardian");
    createHouse(world, "player", 0, 0);
    const enemyHouse = createHouse(world, "enemy", 1, 0);

    guardianTargetingSystem(world, 0);

    expect(world.get(guardian, MoveTarget)).toEqual(world.get(enemyHouse, Position));
  });

  it("leaves a guardian without a target when no enemy is near any of its own houses", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 0, 0, "guardian");
    createHouse(world, "player", 0, 0);
    createWalker(world, "enemy", 50, 50); // far outside GUARDIAN_DEFENSE_RADIUS

    guardianTargetingSystem(world, 0);

    expect(world.has(guardian, MoveTarget)).toBe(false);
  });

  it("leaves a guardian without a target when its faction has no houses at all", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 0, 0, "guardian");
    createWalker(world, "enemy", 1, 0); // right next to the guardian, but nothing of ours to defend

    guardianTargetingSystem(world, 0);

    expect(world.has(guardian, MoveTarget)).toBe(false);
  });

  it("ignores non-guardian walkers entirely", () => {
    const world = new World();
    const walker = createWalker(world, "player", 0, 0, "seeking");
    createHouse(world, "player", 0, 0);
    createWalker(world, "enemy", 1, 0);

    guardianTargetingSystem(world, 0);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("does not override a guardian that already has a target", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 0, 0, "guardian");
    world.add(guardian, MoveTarget, { x: 99, y: 99 });
    createHouse(world, "player", 0, 0);
    createWalker(world, "enemy", 1, 0);

    guardianTargetingSystem(world, 0);

    expect(world.get(guardian, MoveTarget)).toEqual({ x: 99, y: 99 });
  });

  it("does not retarget a guardian that's still resting under HeroCooldown", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 0, 0, "guardian");
    world.add(guardian, HeroCooldown, { remaining: 3 });
    createHouse(world, "player", 0, 0);
    createWalker(world, "enemy", 1, 0);

    guardianTargetingSystem(world, 0);

    expect(world.has(guardian, MoveTarget)).toBe(false);
  });

  it("responds to the threat nearest to itself when multiple own houses are threatened", () => {
    const world = new World();
    const guardian = createWalker(world, "player", 25, 0, "guardian");
    createHouse(world, "player", 0, 0);
    createHouse(world, "player", 30, 0);
    const nearEnemy = createWalker(world, "enemy", 27, 0); // within radius of the (30,0) house, close to the guardian
    createWalker(world, "enemy", 2, 0); // within radius of the (0,0) house, far from the guardian

    guardianTargetingSystem(world, 0);

    expect(world.get(guardian, MoveTarget)).toEqual(world.get(nearEnemy, Position));
  });
});

describe("heroCooldownSystem", () => {
  it("counts down remaining time without removing the component early", () => {
    const world = new World();
    const hero = createWalker(world, "player", 0, 0, "perseus");
    world.add(hero, HeroCooldown, { remaining: 3 });

    heroCooldownSystem(world, 1);

    expect(world.get(hero, HeroCooldown)).toEqual({ remaining: 2 });
  });

  it("removes HeroCooldown once it counts down to zero or below", () => {
    const world = new World();
    const hero = createWalker(world, "player", 0, 0, "perseus");
    world.add(hero, HeroCooldown, { remaining: 1 });

    heroCooldownSystem(world, 2.5);

    expect(world.has(hero, HeroCooldown)).toBe(false);
  });

  it("leaves entities without HeroCooldown untouched", () => {
    const world = new World();
    const hero = createWalker(world, "player", 0, 0, "perseus");

    expect(() => heroCooldownSystem(world, 1)).not.toThrow();
    expect(world.has(hero, HeroCooldown)).toBe(false);
  });
});

describe("heroAdvanceTargetingSystem — every attacking hero", () => {
  /**
   * ペルセウス is the original's baseline and the other three are described
   * as differing from it in exactly one respect each — strength, speed,
   * fire. None of those is *where it will go*, so all four have to march
   * the same way; a hero that stayed home because nothing listed it would
   * simply look broken.
   */
  it("marches every one of ADVANCING_HERO_KINDS at the nearest enemy", () => {
    for (const kind of ADVANCING_HERO_KINDS) {
      const world = new World();
      createFaction(world, "player", { x: 0, y: 0 }, "settle");
      const hero = createWalker(world, "player", 0, 0, kind);
      createWalker(world, "enemy", 5, 0);

      heroAdvanceTargetingSystem(world, 0.1);

      expect(world.get(hero, MoveTarget), kind).toEqual({ x: 5, y: 0 });
    }
  });

  /** 守護者 is the defender — it holds its ground, which is its whole point. */
  it("leaves a 守護者 alone", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "settle");
    const guardian = createWalker(world, "player", 0, 0, "guardian");
    createWalker(world, "enemy", 5, 0);

    heroAdvanceTargetingSystem(world, 0.1);

    expect(world.has(guardian, MoveTarget)).toBe(false);
  });
});
