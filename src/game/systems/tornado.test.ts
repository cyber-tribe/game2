import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { MIN_ELEVATION, createHeightmap, type Heightmap } from "../../world/heightmap";
import { House, Owner, Position, Tornado, Walker, Whirlpool } from "../components";
import { TORNADO_DAMAGE_PER_SECOND, TORNADO_LIFETIME } from "../constants";
import { createTornado } from "../tornado";
import { createTornadoSystem } from "./tornado";

function flatHeightmap(size: number, elevation: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (const row of heightmap.vertices) row.fill(elevation);
  return heightmap;
}

/** A square of open sea in the east half, big enough for isInWaterPool. */
function withSea(heightmap: Heightmap, fromX: number): Heightmap {
  for (let y = 0; y < heightmap.vertices.length; y++) {
    for (let x = fromX; x < heightmap.vertices[y].length; x++) heightmap.vertices[y][x] = MIN_ELEVATION;
  }
  return heightmap;
}

function spawnWalker(world: World, x: number, y: number, strength = 1) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, Walker, { strength, state: "seeking", speed: 1 });
  return entity;
}

const straight = () => 0.5;

describe("createTornadoSystem", () => {
  it("drifts along its heading", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    const tornado = createTornado(world, 10, 10, 1, 0);

    createTornadoSystem({ heightmap, rng: straight })(world, 1);

    expect(world.get(tornado, Position)!.x).toBeGreaterThan(10);
    expect(world.get(tornado, Position)!.y).toBeCloseTo(10, 5);
  });

  it("expires after its lifetime", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    const tornado = createTornado(world, 10, 10, 1, 0, 1);

    createTornadoSystem({ heightmap, rng: straight })(world, 1.5);

    expect(world.isAlive(tornado)).toBe(false);
  });

  /** 「信者を巻き込んで運び体力を減らす」 — carried *and* worn down, not killed on contact. */
  it("grinds a caught walker down and drags it toward the centre", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    // The funnel drifts east to (11, 10) this tick; the walker stands just
    // beyond it, so "dragged toward the centre" means its x must fall.
    createTornado(world, 10, 10, 1, 0);
    const walker = spawnWalker(world, 12, 10, 5);

    createTornadoSystem({ heightmap, rng: straight })(world, 1);

    expect(world.get(walker, Walker)!.strength).toBeLessThan(5);
    expect(world.isAlive(walker)).toBe(true);
    expect(world.get(walker, Position)!.x).toBeLessThan(12);
    // Pulled in, never flung through: the drag stops at the centre.
    expect(world.get(walker, Position)!.x).toBeGreaterThanOrEqual(11);
  });

  it("kills a walker whose strength runs out inside it", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createTornado(world, 10, 10, 0, 0);
    const walker = spawnWalker(world, 10, 10, TORNADO_DAMAGE_PER_SECOND / 2);

    createTornadoSystem({ heightmap, rng: straight })(world, 1);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("leaves walkers outside its radius alone", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createTornado(world, 10, 10, 0, 0);
    const walker = spawnWalker(world, 20, 20, 5);

    createTornadoSystem({ heightmap, rng: straight })(world, 1);

    expect(world.get(walker, Walker)!.strength).toBe(5);
  });

  /**
   * 「一定時間、ランダムに動き回って**建物を吹き飛ばし**、信者を巻き込む」 —
   * buildings come first in the original's own sentence. This used to skip
   * houses outright on the reading that the tornado's damage was "entirely
   * in terms of people", which made a wandering hazard that cannot touch a
   * settlement: an anti-army weapon only, when the original's tornado is
   * the one miracle you send into a town.
   */
  it("throws down a house it passes over", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    const house = world.createEntity();
    world.add(house, Position, { x: 12, y: 10 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 4 });
    createTornado(world, 10, 10, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < 8 && world.isAlive(house); tick++) system(world, 0.5);

    expect(world.isAlive(house)).toBe(false);
  });

  it("leaves a house well outside its radius standing", () => {
    const heightmap = flatHeightmap(40, 20);
    const world = new World();
    const house = world.createEntity();
    world.add(house, Position, { x: 12, y: 18 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 4 });
    createTornado(world, 10, 2, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < 8; tick++) system(world, 0.5);

    expect(world.isAlive(house)).toBe(true);
  });

  /**
   * The interaction both miracles exist for (docs/original-miracles.md
   * #17). Without it the tornado is a slow fire rain and the 渦巻き never
   * exists at all, since nothing else creates one.
   */
  it("throws off a 渦巻き once it reaches open water", () => {
    const heightmap = withSea(flatHeightmap(40, 5), 20);
    const world = new World();
    createTornado(world, 18, 10, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < 8 && world.query(Whirlpool).length === 0; tick++) system(world, 0.5);

    expect(world.query(Whirlpool)).toHaveLength(1);
  });

  /**
   * 「海上では渦巻きを**大量発生**させるため、敵陣の海岸付近に大量に仕掛けると
   * 土地を広げにくくなるので効果的」 — the tactic the original names, and it
   * needs one cast to be worth more than one whirlpool. game2 used to
   * destroy the tornado on the first one, so 「大量」 could only ever mean
   * "cast 竜巻 many times".
   */
  it("keeps crossing the sea and sheds several, rather than being spent on the first", () => {
    const heightmap = withSea(flatHeightmap(60, 5), 5);
    const world = new World();
    createTornado(world, 10, 10, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < TORNADO_LIFETIME * 2; tick++) system(world, 0.5);

    expect(world.query(Whirlpool).length).toBeGreaterThan(1);
  });

  it("does not shed one every tick — they come at TORNADO_WHIRLPOOL_INTERVAL", () => {
    const heightmap = withSea(flatHeightmap(60, 5), 5);
    const world = new World();
    createTornado(world, 10, 10, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < 4; tick++) system(world, 0.5);

    // Two seconds at sea is under one interval past the first, immediate one.
    expect(world.query(Whirlpool)).toHaveLength(1);
  });

  /** A tornado still dies of old age; the sea does not extend its life. */
  it("expires at the end of its 一定時間 even over water", () => {
    const heightmap = withSea(flatHeightmap(60, 5), 5);
    const world = new World();
    createTornado(world, 10, 10, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < TORNADO_LIFETIME + 1; tick++) system(world, 1);

    expect(world.query(Tornado)).toHaveLength(0);
  });

  it("stays a 竜巻 over dry land for its whole life", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    createTornado(world, 10, 10, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < TORNADO_LIFETIME - 1; tick++) system(world, 1);

    expect(world.query(Tornado)).toHaveLength(1);
    expect(world.query(Whirlpool)).toHaveLength(0);
  });

  it("does nothing at all without a heightmap — no water to find", () => {
    const world = new World();
    const tornado = createTornado(world, 10, 10, 1, 0);

    createTornadoSystem({ rng: straight })(world, 1);

    expect(world.isAlive(tornado)).toBe(true);
    expect(world.query(Whirlpool)).toHaveLength(0);
  });
});

/** 竜巻「※オディッセウス除く」 — 気 の神技なので、気 の英雄は巻き込まれない。 */
describe("tornadoSystem and the air school's own hero", () => {
  it("passes straight through オディッセウス", () => {
    const heightmap = flatHeightmap(20, 5);
    const world = new World();
    const odysseus = world.createEntity();
    world.add(odysseus, Position, { x: 10, y: 10 });
    world.add(odysseus, Owner, { faction: "enemy" });
    world.add(odysseus, Walker, { strength: 1, state: "odysseus", speed: 1 });
    createTornado(world, 10, 10, 1, 0);

    createTornadoSystem({ heightmap })(world, 1);

    expect(world.isAlive(odysseus)).toBe(true);
    expect(world.get(odysseus, Walker)!.strength).toBe(1);
  });
});

