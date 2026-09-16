import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { applyVolcano, MIN_ELEVATION, type Heightmap } from "../../world/heightmap";
import { House, LavaFlow, Owner, Position, Walker } from "../components";
import { createLavaFlow } from "../lavaFlow";
import { createLavaFlowSystem } from "./lavaFlow";

function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

/** An island of `radius` around the centre of a `extent` map, open sea beyond. */
function islandHeightmap(extent: number, radius: number): Heightmap {
  const mid = extent / 2;
  const vertices = Array.from({ length: extent + 1 }, (_, y) =>
    Array.from({ length: extent + 1 }, (_, x) =>
      Math.max(Math.abs(x - mid), Math.abs(y - mid)) <= radius ? 3 : MIN_ELEVATION,
    ),
  );
  const rockHardness = Array.from({ length: extent + 1 }, () => new Array<number>(extent + 1).fill(0));
  return { width: extent, height: extent, terrain: "grass", vertices, rockHardness, forest: blankLayer(extent, extent),
      crevice: blankLayer(extent, extent), scorched: blankLayer(extent, extent), road: blankLayer(extent, extent), fungus: blankLayer(extent, extent), wall: blankLayer(extent, extent), boulder: blankLayer(extent, extent), waterLevel: MIN_ELEVATION };
}

function erupt(world: World, heightmap: Heightmap) {
  const eruption = applyVolcano(heightmap, 15, 15, 1, 7, 500, 0);
  return { entity: createLavaFlow(world, eruption.stalled)!, stalled: eruption.stalled! };
}

/**
 * 原作「溶岩は水地形で止まる。**水を埋め立てるとさらに外側へ流れ出す**」 —
 * what makes 火山 a lasting threat rather than a shape.
 */
describe("createLavaFlowSystem", () => {
  it("does nothing at all without a heightmap", () => {
    const world = new World();

    expect(() => createLavaFlowSystem()(world, 1)).not.toThrow();
  });

  it("leaves a waiting flow alone while its shoreline holds", () => {
    const world = new World();
    const heightmap = islandHeightmap(30, 4);
    const { entity } = erupt(world, heightmap);
    const before = world.get(entity, LavaFlow)!.remaining;

    createLavaFlowSystem({ heightmap })(world, 1);

    expect(world.isAlive(entity)).toBe(true);
    expect(world.get(entity, LavaFlow)!.remaining).toBe(before);
  });

  it("lets the lava through when the water in its way is filled in", () => {
    const world = new World();
    const heightmap = islandHeightmap(30, 4);
    const { entity, stalled } = erupt(world, heightmap);
    const shore = stalled.blocked[0];

    heightmap.vertices[shore.y][shore.x] = 3;
    createLavaFlowSystem({ heightmap })(world, 1);

    expect(heightmap.rockHardness[shore.y][shore.x]).toBe(7);
    expect(world.get(entity, LavaFlow)!.remaining).toBeLessThan(stalled.remaining);
  });

  it("reports that the ground changed, so the map is redrawn", () => {
    const world = new World();
    const heightmap = islandHeightmap(30, 4);
    const { stalled } = erupt(world, heightmap);
    let flowed = 0;
    const system = createLavaFlowSystem({ heightmap, onFlow: () => flowed++ });

    system(world, 1);
    expect(flowed).toBe(0); // nothing moved

    const shore = stalled.blocked[0];
    heightmap.vertices[shore.y][shore.x] = 3;
    system(world, 1);
    expect(flowed).toBe(1);
  });

  it("buries whatever was standing on the ground it takes", () => {
    const world = new World();
    const heightmap = islandHeightmap(30, 4);
    const { stalled } = erupt(world, heightmap);
    const shore = stalled.blocked[0];
    heightmap.vertices[shore.y][shore.x] = 3;

    const house = world.createEntity();
    world.add(house, Position, { x: shore.x, y: shore.y });
    world.add(house, Owner, { faction: "player" });
    world.add(house, House, { level: "hut", population: 4 });
    const walker = world.createEntity();
    world.add(walker, Position, { x: shore.x, y: shore.y });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 3, state: "seeking", speed: 1 });

    createLavaFlowSystem({ heightmap })(world, 1);

    expect(world.isAlive(house)).toBe(false);
    expect(world.isAlive(walker)).toBe(false);
  });

  it("clears the flow once it has spent everything", () => {
    const world = new World();
    const heightmap = islandHeightmap(30, 4);
    const { entity } = erupt(world, heightmap);
    for (const row of heightmap.vertices) row.fill(3); // the whole sea filled in

    createLavaFlowSystem({ heightmap })(world, 1);

    expect(world.isAlive(entity)).toBe(false);
  });

  /** One spade-width of new land is not the sea filled in. */
  it("goes back to waiting when the next channel stops it again", () => {
    const world = new World();
    const heightmap = islandHeightmap(30, 4);
    const { entity, stalled } = erupt(world, heightmap);
    const shore = stalled.blocked[0];
    heightmap.vertices[shore.y][shore.x] = 3;

    const system = createLavaFlowSystem({ heightmap });
    system(world, 1);
    expect(world.isAlive(entity)).toBe(true);

    // And it stays put until the next stretch is filled in too.
    const held = world.get(entity, LavaFlow)!.remaining;
    system(world, 1);
    expect(world.get(entity, LavaFlow)!.remaining).toBe(held);
  });
});

describe("createLavaFlow", () => {
  it("creates nothing for an eruption with nothing left to spend", () => {
    const world = new World();

    expect(createLavaFlow(world, undefined)).toBeUndefined();
    expect(world.query(LavaFlow)).toHaveLength(0);
  });
});
