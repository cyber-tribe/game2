import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { createHeightmap, isScorched, type Heightmap } from "../../world/heightmap";
import { House, Owner, Position, Storm, Walker } from "../components";
import { STORM_STRIKE_INTERVAL } from "../constants";
import { createStorm } from "../storm";
import { createStormSystem } from "./storm";

function flatHeightmap(size: number, elevation: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (const row of heightmap.vertices) row.fill(elevation);
  return heightmap;
}

function spawnWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, Walker, { strength: 9, state: "seeking", speed: 1 });
  return entity;
}

function spawnHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

/** Every bolt lands exactly on the cloud's own centre. */
const dead_on = () => 0;

describe("createStormSystem", () => {
  it("keeps striking for as long as it lasts, then goes", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createStorm(world, 10, 10, STORM_STRIKE_INTERVAL * 2.5);
    const system = createStormSystem({ heightmap, rng: dead_on });

    for (let i = 0; i < 2; i++) system(world, STORM_STRIKE_INTERVAL);
    expect(world.query(Storm)).toHaveLength(1);

    system(world, STORM_STRIKE_INTERVAL);
    expect(world.query(Storm)).toHaveLength(0);
  });

  it("burns the ground under it", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createStorm(world, 10, 10);

    createStormSystem({ heightmap, rng: dead_on })(world, STORM_STRIKE_INTERVAL);

    expect(isScorched(heightmap, 10, 10)).toBe(true);
  });

  it("destroys houses under it", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createStorm(world, 10, 10);
    spawnHouse(world, 10, 10);

    createStormSystem({ heightmap, rng: dead_on })(world, STORM_STRIKE_INTERVAL);

    expect(world.query(House)).toHaveLength(0);
  });

  /**
   * 「この雷は人には直接当たらない」 (docs/original-miracles.md #18) — the
   * original's own distinction between 嵐 and 雷, and what gives the pair
   * two jobs instead of two sizes of one. A storm that also killed would
   * simply be the better of the two.
   */
  it("never touches people", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createStorm(world, 10, 10);
    const walker = spawnWalker(world, 10, 10);

    const system = createStormSystem({ heightmap, rng: dead_on });
    for (let i = 0; i < 10; i++) system(world, STORM_STRIKE_INTERVAL);

    expect(world.isAlive(walker)).toBe(true);
  });

  it("waits between strikes rather than firing every tick", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createStorm(world, 10, 10);
    let strikes = 0;
    const system = createStormSystem({ heightmap, rng: dead_on, onScorch: () => strikes++ });

    for (let i = 0; i < 20; i++) system(world, STORM_STRIKE_INTERVAL / 10);

    expect(strikes).toBeLessThanOrEqual(2);
  });

  it("does not move", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    const storm = createStorm(world, 10, 10);

    createStormSystem({ heightmap, rng: dead_on })(world, STORM_STRIKE_INTERVAL * 3);

    expect(world.get(storm, Position)).toEqual({ x: 10, y: 10 });
  });
});
