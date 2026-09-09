import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import type { Heightmap } from "../world/heightmap";
import { Drowning, MoveTarget, Owner, Position, Walker, type FactionId } from "./components";
import { RESCUE_RADIUS } from "./constants";
import { rescueDrowning } from "./rescue";

function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

/** Land where x >= landFromX, open sea to the west of it. */
function coastHeightmap(width: number, height: number, landFromX: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () =>
    Array.from({ length: width + 1 }, (_, x) => (x >= landFromX ? 5 : 0)),
  );
  const rockHardness = Array.from({ length: height + 1 }, () => new Array<number>(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, forest: blankLayer(width, height),
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), wall: blankLayer(width, height), boulder: blankLayer(width, height), waterLevel: 0 };
}

function drowningWalker(world: World, x: number, y: number, faction: FactionId = "player") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 3, state: "seeking", speed: 1 });
  world.add(entity, Drowning, { breath: 1.5 });
  return entity;
}

describe("rescueDrowning", () => {
  it("puts a drowning follower back on the nearest dry ground", () => {
    const world = new World();
    const heightmap = coastHeightmap(20, 20, 10);
    const walker = drowningWalker(world, 8, 10);

    const rescued = rescueDrowning(world, heightmap, "player", { x: 8, y: 10 });

    expect(rescued).toBe(walker);
    expect(world.get(walker, Position)).toEqual({ x: 10, y: 10 }); // the shore, straight east
    expect(world.has(walker, Drowning)).toBe(false);
  });

  it("keeps the walker itself intact — a rescue is not a respawn", () => {
    const world = new World();
    const heightmap = coastHeightmap(20, 20, 10);
    const walker = drowningWalker(world, 8, 10);

    rescueDrowning(world, heightmap, "player", { x: 8, y: 10 });

    expect(world.isAlive(walker)).toBe(true);
    expect(world.get(walker, Walker)).toEqual({ strength: 3, state: "seeking", speed: 1 });
  });

  /** Its old destination was out in the water it just came from. */
  it("drops the target it was swimming toward", () => {
    const world = new World();
    const heightmap = coastHeightmap(20, 20, 10);
    const walker = drowningWalker(world, 8, 10);
    world.add(walker, MoveTarget, { x: 2, y: 2 });

    rescueDrowning(world, heightmap, "player", { x: 8, y: 10 });

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("takes the closest of several drowning followers", () => {
    const world = new World();
    const heightmap = coastHeightmap(20, 20, 10);
    const far = drowningWalker(world, 8, 14);
    const near = drowningWalker(world, 8, 10);

    expect(rescueDrowning(world, heightmap, "player", { x: 8, y: 10 })).toBe(near);
    expect(world.has(far, Drowning)).toBe(true); // one tap, one rescue
  });

  it("reaches no further than RESCUE_RADIUS", () => {
    const world = new World();
    const heightmap = coastHeightmap(40, 40, 20);
    drowningWalker(world, 5, 5 + RESCUE_RADIUS + 1);

    expect(rescueDrowning(world, heightmap, "player", { x: 5, y: 5 })).toBeUndefined();
  });

  it("will not fish an enemy walker out of the sea", () => {
    const world = new World();
    const heightmap = coastHeightmap(20, 20, 10);
    const theirs = drowningWalker(world, 8, 10, "enemy");

    expect(rescueDrowning(world, heightmap, "player", { x: 8, y: 10 })).toBeUndefined();
    expect(world.has(theirs, Drowning)).toBe(true);
  });

  it("does nothing where nobody is drowning", () => {
    const world = new World();
    const heightmap = coastHeightmap(20, 20, 10);
    const dry = world.createEntity();
    world.add(dry, Position, { x: 12, y: 12 });
    world.add(dry, Owner, { faction: "player" });
    world.add(dry, Walker, { strength: 1, state: "seeking", speed: 1 });

    expect(rescueDrowning(world, heightmap, "player", { x: 12, y: 12 })).toBeUndefined();
    expect(world.get(dry, Position)).toEqual({ x: 12, y: 12 });
  });

  /**
   * Hauling someone across half the map would be a teleport, which is a
   * far bigger operation than the one the original's ○× grants.
   */
  it("leaves someone adrift in the open ocean where they are", () => {
    const world = new World();
    const heightmap = coastHeightmap(40, 40, 999); // no land anywhere
    const walker = drowningWalker(world, 20, 20);

    expect(rescueDrowning(world, heightmap, "player", { x: 20, y: 20 })).toBeUndefined();
    expect(world.get(walker, Position)).toEqual({ x: 20, y: 20 });
    expect(world.has(walker, Drowning)).toBe(true);
  });

  it("picks the nearer shore when there is one on both sides", () => {
    const world = new World();
    const heightmap = coastHeightmap(20, 20, 999); // all sea...
    for (let y = 0; y <= 20; y++) {
      heightmap.vertices[y][3] = 5; // ...but for two strips of land
      heightmap.vertices[y][12] = 5;
    }
    const walker = drowningWalker(world, 11, 10);

    rescueDrowning(world, heightmap, "player", { x: 11, y: 10 });

    expect(world.get(walker, Position)).toEqual({ x: 12, y: 10 });
  });
});
