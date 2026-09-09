import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { applyEarthquake, type Heightmap } from "../world/heightmap";
import { Quake } from "./components";
import { EARTHQUAKE_SHAKE_DURATION, EARTHQUAKE_SHAKE_RADIUS } from "./constants";
import { createQuake, isGroundShaking } from "./quake";
import { createQuakeSystem } from "./systems/quake";

function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

function flatHeightmap(width: number, height: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => new Array<number>(width + 1).fill(5));
  const rockHardness = Array.from({ length: height + 1 }, () => new Array<number>(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, forest: blankLayer(width, height),
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), wall: blankLayer(width, height), boulder: blankLayer(width, height), waterLevel: 0 };
}


describe("createQuake", () => {
  it("holds the fissure the earthquake actually tore", () => {
    const world = new World();
    const path = [
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 5 },
    ];

    const entity = createQuake(world, path)!;

    expect(world.get(entity, Quake)).toEqual({ remaining: EARTHQUAKE_SHAKE_DURATION, path });
  });

  it("creates nothing for a crack that tore no ground at all", () => {
    const world = new World();

    expect(createQuake(world, [])).toBeUndefined();
    expect([...world.query(Quake)]).toHaveLength(0);
  });
});

describe("isGroundShaking", () => {
  it("is false on a map nothing has cracked", () => {
    expect(isGroundShaking(new World(), 5, 5)).toBe(false);
  });

  it("holds the ground the fissure itself runs through", () => {
    const world = new World();
    createQuake(world, [{ x: 10, y: 10 }]);

    expect(isGroundShaking(world, 10, 10)).toBe(true);
  });

  /**
   * The fissure is one vertex wide, so without a margin the spade could be
   * planted alongside it and push land in sideways — the very repair the
   * original denies.
   */
  it("reaches EARTHQUAKE_SHAKE_RADIUS to either side of it, and no further", () => {
    const world = new World();
    createQuake(world, [{ x: 10, y: 10 }]);

    expect(isGroundShaking(world, 10 + EARTHQUAKE_SHAKE_RADIUS, 10)).toBe(true);
    expect(isGroundShaking(world, 10 + EARTHQUAKE_SHAKE_RADIUS + 0.01, 10)).toBe(false);
  });

  /**
   * A quake is a line, not a disc: the far end of a ten-vertex crack is
   * held just as firmly as the point it was cast at, and the ground beside
   * its middle is free.
   */
  it("holds the far end of a long fissure as firmly as its origin", () => {
    const world = new World();
    createQuake(world, [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);

    expect(isGroundShaking(world, 10, 10)).toBe(true);
    expect(isGroundShaking(world, 20, 10)).toBe(true);
    expect(isGroundShaking(world, 15, 10)).toBe(false); // between the two, untouched
  });

  it("holds ground under any live quake, not only the newest", () => {
    const world = new World();
    createQuake(world, [{ x: 5, y: 5 }]);
    createQuake(world, [{ x: 40, y: 40 }]);

    expect(isGroundShaking(world, 5, 5)).toBe(true);
    expect(isGroundShaking(world, 40, 40)).toBe(true);
  });
});

describe("createQuakeSystem", () => {
  it("runs the shaking down, and lets the spade back in once it stops", () => {
    const world = new World();
    createQuake(world, [{ x: 10, y: 10 }], 3);
    const system = createQuakeSystem();

    system(world, 2);
    expect(isGroundShaking(world, 10, 10)).toBe(true);

    system(world, 2);
    expect(isGroundShaking(world, 10, 10)).toBe(false);
    expect([...world.query(Quake)]).toHaveLength(0);
  });

  it("does nothing at all to a world without quakes", () => {
    const world = new World();

    expect(() => createQuakeSystem()(world, 1)).not.toThrow();
  });
});

/**
 * The two halves together: 地震 tears a fissure and the ground along it
 * goes on moving — 原作「地震が続いている間は修復が出来ない」.
 */
describe("an earthquake's own fissure", () => {
  it("shakes the ground it tore, all the way along", () => {
    const world = new World();
    const heightmap = flatHeightmap(64, 64);
    const torn = applyEarthquake(heightmap, 20, 20, 1, 0, 10, () => 0.5);

    expect(torn.length).toBe(10);
    createQuake(world, torn);

    for (const point of torn) {
      expect({ point, shaking: isGroundShaking(world, point.x, point.y) }).toEqual({ point, shaking: true });
    }
  });

  it("leaves the rest of the map alone", () => {
    const world = new World();
    const heightmap = flatHeightmap(64, 64);
    createQuake(world, applyEarthquake(heightmap, 20, 20, 1, 0, 10, () => 0.5));

    expect(isGroundShaking(world, 50, 50)).toBe(false);
  });

  /** A crack that runs straight off the edge tears nothing and shakes nothing. */
  it("shakes nothing when the crack leaves the map immediately", () => {
    const world = new World();
    const heightmap = flatHeightmap(16, 16);
    const torn = applyEarthquake(heightmap, 16, 8, 1, 0, 10, () => 0.5);

    expect(torn).toEqual([]);
    expect(createQuake(world, torn)).toBeUndefined();
  });
});
