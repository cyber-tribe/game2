import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { applyFlower, createHeightmap, isBuildable, isScorched, type Heightmap } from "../../world/heightmap";
import { House, Owner, Position, Walker, type WalkerState } from "../components";
import { createFirePillar } from "../firePillar";
import { createFirePillarSystem } from "./firePillar";

function flatHeightmap(size: number, elevation: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (const row of heightmap.vertices) row.fill(elevation);
  return heightmap;
}

function spawnWalker(world: World, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, Walker, { strength: 9, state, speed: 1 });
  return entity;
}

function spawnHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

const straight = () => 0.5;

describe("createFirePillarSystem", () => {
  it("drifts along its heading", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    const pillar = createFirePillar(world, 10, 10, 1, 0);

    createFirePillarSystem({ heightmap, rng: straight })(world, 1);

    expect(world.get(pillar, Position)!.x).toBeGreaterThan(10);
  });

  it("expires after its lifetime", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0, 1);

    createFirePillarSystem({ heightmap, rng: straight })(world, 1.5);

    expect(world.query(Position, Walker)).toHaveLength(0);
  });

  /** 「地面を荒地化し」 — the damage that outlasts the miracle. */
  it("burns the ground it crosses barren", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);

    createFirePillarSystem({ heightmap, rng: straight })(world, 1);

    expect(isScorched(heightmap, 11, 10)).toBe(true);
    expect(isBuildable(heightmap, 11, 10)).toBe(false);
  });

  it("burns away whatever was growing or laid there", () => {
    const heightmap = flatHeightmap(40, 5);
    heightmap.forest[10][11] = true;
    heightmap.road[10][11] = true;
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);

    createFirePillarSystem({ heightmap, rng: straight })(world, 1);

    expect(heightmap.forest[10][11]).toBe(false);
    expect(heightmap.road[10][11]).toBe(false);
  });

  it("reports the burning so the terrain can be redrawn", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);
    let scorches = 0;

    createFirePillarSystem({ heightmap, rng: straight, onScorch: () => scorches++ })(world, 0.5);

    expect(scorches).toBeGreaterThan(0);
  });

  it("kills walkers and collapses houses it reaches", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);
    spawnWalker(world, 11, 10);
    spawnHouse(world, 11, 10);

    createFirePillarSystem({ heightmap, rng: straight })(world, 1);

    expect(world.query(Walker)).toHaveLength(0);
    expect(world.query(House)).toHaveLength(0);
  });

  /**
   * 「火が効かず焼死しない」 (docs/original-miracles.md #23) — fire is fire,
   * whichever miracle lit it. A hero who survives fire rain but not a fire
   * pillar would be a rule nobody could remember.
   */
  it("leaves アキレス standing", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);
    const achilles = spawnWalker(world, 11, 10, "achilles");
    spawnWalker(world, 11, 10, "hercules");

    createFirePillarSystem({ heightmap, rng: straight })(world, 1);

    expect(world.isAlive(achilles)).toBe(true);
    expect(world.query(Walker)).toHaveLength(1);
  });

  it("leaves everything outside its radius alone", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);
    const far = spawnWalker(world, 25, 25);

    createFirePillarSystem({ heightmap, rng: straight })(world, 1);

    expect(world.isAlive(far)).toBe(true);
    expect(isScorched(heightmap, 25, 25)).toBe(false);
  });

  /** 花 is the counter to every kind of ruined ground — now including ash. */
  it("leaves ground a 花 can bring back", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);
    createFirePillarSystem({ heightmap, rng: straight })(world, 1);
    expect(isScorched(heightmap, 11, 10)).toBe(true);

    applyFlower(heightmap, 11, 10, 2);

    expect(isScorched(heightmap, 11, 10)).toBe(false);
    expect(isBuildable(heightmap, 11, 10)).toBe(true);
  });

  it("does not burn water", () => {
    const heightmap = flatHeightmap(40, 0);
    const world = new World();
    createFirePillar(world, 10, 10, 1, 0);

    createFirePillarSystem({ heightmap, rng: straight })(world, 1);

    expect(isScorched(heightmap, 11, 10)).toBe(false);
  });
});
