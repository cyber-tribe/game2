import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { House, Owner, Position, type FactionId } from "../components";
import { createHouseUpgradeSystem } from "./houseUpgrade";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };
}

function createHouse(world: World, x: number, y: number, level: House["level"] = "hut") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, House, { level, population: 0 });
  return entity;
}

describe("createHouseUpgradeSystem", () => {
  it("is a no-op when no heightmap is given", () => {
    const world = new World();
    const house = createHouse(world, 5, 5);

    const system = createHouseUpgradeSystem();
    expect(() => system(world, 0)).not.toThrow();
    expect(world.get(house, House)!.level).toBe("hut");
  });

  it("leaves a hut alone when the surrounding land isn't flat enough", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        heightmap.vertices[5 + dy][5 + dx] = 99; // break every neighbor but the center
      }
    }
    const house = createHouse(world, 5, 5);

    createHouseUpgradeSystem({ heightmap })(world, 0);

    expect(world.get(house, House)!.level).toBe("hut");
  });

  it("upgrades a hut on perfectly flat land all the way to castle", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5); // fully flat: max possible flat-neighbor count
    const house = createHouse(world, 5, 5);

    createHouseUpgradeSystem({ heightmap })(world, 0);

    expect(world.get(house, House)!.level).toBe("castle");
  });

  it("downgrades a house when its surroundings become rough (e.g. an earthquake)", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    const house = createHouse(world, 5, 5, "castle");

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        heightmap.vertices[5 + dy][5 + dx] = 99; // flatness now only justifies "hut"
      }
    }

    createHouseUpgradeSystem({ heightmap })(world, 0);

    expect(world.get(house, House)!.level).toBe("hut");
  });

  it("reports reaching castle exactly once, not on every intermediate upgrade", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5); // fully flat -> hut straight to castle in one pass
    const house = createHouse(world, 5, 5);
    world.add(house, Owner, { faction: "player" });

    const reached: FactionId[] = [];
    createHouseUpgradeSystem({ heightmap, onReachCastle: (faction) => reached.push(faction) })(world, 0);
    expect(world.get(house, House)!.level).toBe("castle");
    expect(reached).toEqual(["player"]);

    // Already at castle: re-running shouldn't report it again.
    createHouseUpgradeSystem({ heightmap, onReachCastle: (faction) => reached.push(faction) })(world, 0);
    expect(reached).toEqual(["player"]);
  });

  it("does not report reaching castle for a house without an Owner", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    createHouse(world, 5, 5); // no Owner attached, as in the other tests here

    const reached: FactionId[] = [];
    expect(() => createHouseUpgradeSystem({ heightmap, onReachCastle: (faction) => reached.push(faction) })(world, 0)).not.toThrow();
    expect(reached).toEqual([]);
  });

  it("preserves the house's population when it upgrades", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    const house = world.createEntity();
    world.add(house, Position, { x: 5, y: 5 });
    world.add(house, House, { level: "hut", population: 7 });

    createHouseUpgradeSystem({ heightmap })(world, 0);

    expect(world.get(house, House)!.population).toBe(7);
  });
});
