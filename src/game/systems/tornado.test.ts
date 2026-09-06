import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { MIN_ELEVATION, createHeightmap, type Heightmap } from "../../world/heightmap";
import { Owner, Position, Tornado, Walker, Whirlpool } from "../components";
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
   * The interaction both miracles exist for (docs/original-miracles.md
   * #17): 「水地形へ入ると渦巻きへ変化する」. Without it the tornado is a
   * slow fire rain and the 渦巻き never exists at all, since nothing else
   * creates one.
   */
  it("becomes a 渦巻き when it reaches open water", () => {
    const heightmap = withSea(flatHeightmap(40, 5), 20);
    const world = new World();
    createTornado(world, 18, 10, 1, 0);

    const system = createTornadoSystem({ heightmap, rng: straight });
    // Checked by component rather than by the entity handle: World recycles
    // ids the instant one is freed, so the whirlpool can be handed the
    // tornado's own id and a stale handle would still report alive.
    for (let tick = 0; tick < 20 && world.query(Tornado).length > 0; tick++) system(world, 0.5);

    expect(world.query(Tornado)).toHaveLength(0);
    expect(world.query(Whirlpool)).toHaveLength(1);
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
