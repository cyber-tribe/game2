import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { FactionState, House, Owner, Position } from "../components";
import { TERRAIN_EDIT_MANA_COST } from "../constants";
import { createFaction } from "../faction";
import { createEnemyTerraformSystem } from "./enemyTerraform";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };
}

function createHouse(world: World, faction: "player" | "enemy", x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

describe("createEnemyTerraformSystem", () => {
  it("is a no-op when no heightmap is given", () => {
    const world = new World();
    createFaction(world, "enemy", { x: 0, y: 0 });
    createHouse(world, "enemy", 5, 5);

    const system = createEnemyTerraformSystem();
    expect(() => system(world, 5)).not.toThrow();
  });

  it("flattens a house's least-flat neighbor and spends mana for it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: 10 });
    createHouse(world, "enemy", 5, 5);

    const heightmap = flatHeightmap(10, 10, 5);
    heightmap.vertices[5][6] = 8; // one neighbor sticks up above the house's own elevation

    const system = createEnemyTerraformSystem({ decisionInterval: 5, heightmap });
    system(world, 5);

    expect(heightmap.vertices[5][6]).toBe(7); // nudged one step back toward 5
    expect(world.get(enemy, FactionState)!.mana).toBe(10 - TERRAIN_EDIT_MANA_COST);
  });

  it("ignores houses belonging to another faction", () => {
    const world = new World();
    createFaction(world, "enemy", { x: 0, y: 0 });
    const player = createFaction(world, "player", { x: 9, y: 9 });
    world.add(player, FactionState, { ...world.get(player, FactionState)!, mana: 10 });
    createHouse(world, "player", 5, 5);

    const heightmap = flatHeightmap(10, 10, 5);
    heightmap.vertices[5][6] = 8;

    createEnemyTerraformSystem({ decisionInterval: 5, heightmap })(world, 5);

    expect(heightmap.vertices[5][6]).toBe(8); // untouched — that house isn't the enemy's
  });

  it("does nothing around a house whose surroundings are already flat", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: 10 });
    createHouse(world, "enemy", 5, 5);

    const heightmap = flatHeightmap(10, 10, 5);

    createEnemyTerraformSystem({ decisionInterval: 5, heightmap })(world, 5);

    expect(world.get(enemy, FactionState)!.mana).toBe(10); // nothing to flatten, nothing spent
  });

  it("does not edit the terrain when the faction can't afford the cost", () => {
    const world = new World();
    createFaction(world, "enemy", { x: 0, y: 0 }); // starts at 0 mana
    createHouse(world, "enemy", 5, 5);

    const heightmap = flatHeightmap(10, 10, 5);
    heightmap.vertices[5][6] = 8;

    createEnemyTerraformSystem({ decisionInterval: 5, heightmap })(world, 5);

    expect(heightmap.vertices[5][6]).toBe(8);
  });

  it("does not run again until a full interval has elapsed since the last pass", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: 10 });
    createHouse(world, "enemy", 5, 5);

    const heightmap = flatHeightmap(10, 10, 5);
    heightmap.vertices[5][6] = 8;

    const system = createEnemyTerraformSystem({ decisionInterval: 5, heightmap });
    system(world, 5); // first pass always runs, flattens once
    expect(heightmap.vertices[5][6]).toBe(7);

    heightmap.vertices[5][6] = 8; // reset to see whether a second edit happens
    system(world, 4); // interval not yet elapsed

    expect(heightmap.vertices[5][6]).toBe(8);
  });
});
