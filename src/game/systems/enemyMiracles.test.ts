import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { FactionState, House, Owner, Position, Walker } from "../components";
import { ARMAGEDDON_MANA_COST, EARTHQUAKE_MANA_COST, KNIGHT_MANA_COST, VOLCANO_MANA_COST } from "../constants";
import { createFaction } from "../faction";
import { createEnemyMiracleSystem } from "./enemyMiracles";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };
}

function createHouse(world: World, faction: "player" | "enemy", x: number, y: number, population = 0) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population });
  return entity;
}

function createWalker(world: World, faction: "player" | "enemy", state: Walker["state"] = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

const WORLD_CENTER = { x: 10, y: 10 };

describe("createEnemyMiracleSystem", () => {
  it("is a no-op when no heightmap or worldCenter is given", () => {
    const world = new World();
    createFaction(world, "enemy", { x: 0, y: 0 });

    expect(() => createEnemyMiracleSystem()(world, 10)).not.toThrow();
  });

  it("triggers final battle once its population lead is decisive and it can afford it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 20); // 20 vs 1 -> well past the ratio
    createHouse(world, "player", 8, 8, 1);

    const events: unknown[] = [];
    const system = createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    });
    system(world, 8);

    expect(world.get(enemy, FactionState)!.finalBattle).toBe(true);
    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    expect(events).toEqual([{ type: "armageddon" }]);
  });

  it("does not trigger final battle without a decisive population lead", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 5);
    createHouse(world, "player", 8, 8, 5); // even population

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER })(world, 8);

    expect(world.get(enemy, FactionState)!.finalBattle).toBeUndefined();
  });

  it("knights its leader once aggressive, if it can afford it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy");
    world.add(enemy, FactionState, {
      ...world.get(enemy, FactionState)!,
      mana: KNIGHT_MANA_COST,
      leaderId: leader,
    });
    createFaction(world, "player", { x: 9, y: 9 });

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(leader, Walker)!.state).toBe("knight");
    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    expect(events).toEqual([{ type: "knight" }]);
  });

  it("does not knight an already-knighted leader", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy", "knight");
    world.add(enemy, FactionState, {
      ...world.get(enemy, FactionState)!,
      mana: KNIGHT_MANA_COST,
      leaderId: leader,
    });
    createFaction(world, "player", { x: 9, y: 9 });

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(KNIGHT_MANA_COST); // untouched — nothing to knight
  });

  it("casts an earthquake on a random opponent house when nothing higher-priority applies", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    const heightmap = flatHeightmap(10, 10, 5);
    const events: unknown[] = [];
    const system = createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap,
      worldCenter: WORLD_CENTER,
      rng: () => 0,
      onAction: (event) => events.push(event),
    });
    system(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    // The whole neighborhood around (5, 5) should no longer be uniformly flat.
    const touched = heightmap.vertices.some((row) => row.some((h) => h !== 5));
    expect(touched).toBe(true);
    expect(events).toEqual([{ type: "earthquake", position: { x: 5, y: 5 } }]);
  });

  it("escalates to a volcano once its population lead is real but not yet decisive, if it can afford it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 0, 0, 13);
    const target = createHouse(world, "player", 5, 5, 10); // ratio 1.3 -> past VOLCANO_POPULATION_RATIO, short of armageddon's 1.8

    const heightmap = flatHeightmap(10, 10, 5);
    createEnemyMiracleSystem({ decisionInterval: 8, heightmap, worldCenter: WORLD_CENTER, rng: () => 0 })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    expect(world.isAlive(target)).toBe(false); // eruptVolcano destroys anything it lands on
    expect(heightmap.rockHardness[5][5]).toBeGreaterThan(0);
  });

  it("does not escalate to a volcano below VOLCANO_POPULATION_RATIO, even if it can afford one", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 0, 0, 10);
    const target = createHouse(world, "player", 5, 5, 10); // even population -> no escalation

    const heightmap = flatHeightmap(10, 10, 5);
    createEnemyMiracleSystem({ decisionInterval: 8, heightmap, worldCenter: WORLD_CENTER, rng: () => 0 })(world, 8);

    expect(world.isAlive(target)).toBe(true); // no volcano landed on it
    // Falls through to the (much cheaper) earthquake instead, so mana isn't fully spent.
    expect(world.get(enemy, FactionState)!.mana).toBe(VOLCANO_MANA_COST - EARTHQUAKE_MANA_COST);
  });

  it("targets the opponent's densest house cluster instead of picking uniformly at random", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 19, y: 19 });
    createHouse(world, "player", 5, 5); // clustered pair
    createHouse(world, "player", 6, 5);
    createHouse(world, "player", 15, 15); // isolated, created last

    const heightmap = flatHeightmap(20, 20, 5);
    // A rng biased toward the last index would pick the isolated house under
    // a naive uniformly-random choice — proving the cluster is preferred on
    // its merits, not by coincidence of rng.
    createEnemyMiracleSystem({ decisionInterval: 8, heightmap, worldCenter: WORLD_CENTER, rng: () => 0.99 })(world, 8);

    expect(heightmap.vertices[15][15]).toBe(5); // untouched — well outside the earthquake's radius around the cluster
    const clusterTouched = heightmap.vertices
      .slice(2, 9)
      .some((row) => row.slice(2, 9).some((h) => h !== 5));
    expect(clusterTouched).toBe(true);
  });

  it("does nothing when the opponent has no houses to target and no other action applies", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(EARTHQUAKE_MANA_COST); // nothing to target, nothing spent
    expect(events).toEqual([]);
  });

  it("does not act once finalBattle is already set", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, {
      ...world.get(enemy, FactionState)!,
      mana: ARMAGEDDON_MANA_COST,
      finalBattle: true,
    });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(ARMAGEDDON_MANA_COST);
  });

  it("does not run again until a full interval has elapsed since the last pass", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    const system = createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER });
    system(world, 8); // first pass always runs
    expect(world.get(enemy, FactionState)!.mana).toBe(0);

    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    system(world, 4); // interval not yet elapsed

    expect(world.get(enemy, FactionState)!.mana).toBe(EARTHQUAKE_MANA_COST);
  });
});
