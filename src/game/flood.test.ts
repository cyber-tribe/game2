import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { createHeightmap, type Heightmap } from "../world/heightmap";
import { House, Owner, Position, Walker } from "./components";
import { drownFlood } from "./flood";

function flatHeightmap(width: number, height: number, elevation: number, waterLevel = 0): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel };
}

function createHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

function createWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("drownFlood", () => {
  it("destroys a house that ends up at or below the new sea level", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 1, 1); // land at height 1, water risen to 1
    const house = createHouse(world, 5, 5);

    drownFlood(world, heightmap);

    expect(world.isAlive(house)).toBe(false);
  });

  it("destroys a walker that ends up submerged", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 1, 1);
    const walker = createWalker(world, 5, 5);

    drownFlood(world, heightmap);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("leaves houses and walkers on higher ground alone", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5, 1); // land well above the new sea level
    const house = createHouse(world, 5, 5);
    const walker = createWalker(world, 5, 5);

    drownFlood(world, heightmap);

    expect(world.isAlive(house)).toBe(true);
    expect(world.isAlive(walker)).toBe(true);
  });

  it("affects both factions equally", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 1, 1);
    const playerHouse = createHouse(world, 5, 5);
    const enemyWalker = createWalker(world, 8, 8);

    drownFlood(world, heightmap);

    expect(world.isAlive(playerHouse)).toBe(false);
    expect(world.isAlive(enemyWalker)).toBe(false);
  });

  it("does nothing to a fresh heightmap whose water level hasn't risen", () => {
    const world = new World();
    const heightmap = createHeightmap(10, 10);
    const house = createHouse(world, 5, 5);

    expect(() => drownFlood(world, heightmap)).not.toThrow();
    expect(world.isAlive(house)).toBe(true);
  });
});
