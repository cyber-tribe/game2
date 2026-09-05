import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { DROWNING_BREATH_SECONDS } from "../constants";
import { Drowning, Owner, Position, Walker, type WalkerState } from "../components";
import type { ImpactEffectEvent } from "./effects";
import { createDrowningSystem } from "./drowning";

function flatHeightmap(width: number, height: number, elevation: number, waterLevel = 0): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel };
}

/** Digs a real 2x2-tile pool of water (see isInWaterPool) at tiles (x,y)..(x+1,y+1). */
function digPool(heightmap: Heightmap, x: number, y: number): void {
  for (let vy = y; vy <= y + 2; vy++) {
    for (let vx = x; vx <= x + 2; vx++) heightmap.vertices[vy][vx] = 0;
  }
}

function createWalker(world: World, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

describe("createDrowningSystem", () => {
  it("leaves a walker on dry land untouched, even after many ticks", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    const walker = createWalker(world, 5, 5);
    const system = createDrowningSystem({ heightmap });

    for (let i = 0; i < 20; i++) system(world, 1);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.get(walker, Drowning)).toBeUndefined();
  });

  it("does nothing when there is no heightmap (test fixtures that don't care about terrain)", () => {
    const world = new World();
    const walker = createWalker(world, 5, 5);
    const system = createDrowningSystem();

    expect(() => system(world, 1)).not.toThrow();
    expect(world.isAlive(walker)).toBe(true);
  });

  it("does not drown a walker standing on a single isolated wet tile — a lone corner isn't a real pool", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    heightmap.vertices[5][5] = 0;
    heightmap.vertices[5][6] = 0;
    heightmap.vertices[6][5] = 0;
    heightmap.vertices[6][6] = 0;
    const walker = createWalker(world, 5.5, 5.5);
    const system = createDrowningSystem({ heightmap });

    for (let i = 0; i < 20; i++) system(world, 1);

    expect(world.isAlive(walker)).toBe(true);
  });

  it("attaches a breath countdown to a walker caught in a genuine water pool, decreasing each tick", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    digPool(heightmap, 5, 5);
    const walker = createWalker(world, 5.5, 5.5);
    const system = createDrowningSystem({ heightmap });

    system(world, 1);
    expect(world.get(walker, Drowning)!.breath).toBeCloseTo(DROWNING_BREATH_SECONDS - 1);

    system(world, 1);
    expect(world.get(walker, Drowning)!.breath).toBeCloseTo(DROWNING_BREATH_SECONDS - 2);
    expect(world.isAlive(walker)).toBe(true);
  });

  it("drowns a walker once its breath runs out, reporting a drowned impact", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    digPool(heightmap, 5, 5);
    const walker = createWalker(world, 5.5, 5.5);
    const impacts: ImpactEffectEvent[] = [];
    const system = createDrowningSystem({ heightmap, onImpact: (event) => impacts.push(event) });

    for (let i = 0; i < Math.ceil(DROWNING_BREATH_SECONDS) + 1; i++) system(world, 1);

    expect(world.isAlive(walker)).toBe(false);
    expect(impacts).toEqual([{ position: { x: 5.5, y: 5.5 }, type: "drowned" }]);
  });

  it("fully restores breath the instant a walker reaches dry land again", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    digPool(heightmap, 5, 5);
    const walker = createWalker(world, 5.5, 5.5);
    const system = createDrowningSystem({ heightmap });

    system(world, DROWNING_BREATH_SECONDS - 0.5); // deep into the countdown, but not drowned yet
    expect(world.get(walker, Drowning)).toBeDefined();

    world.add(walker, Position, { x: 0.5, y: 0.5 }); // swims back to dry land
    system(world, 0.01);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.get(walker, Drowning)).toBeUndefined();

    // Wading back in starts a fresh countdown, not a resumed one.
    world.add(walker, Position, { x: 5.5, y: 5.5 });
    system(world, 1);
    expect(world.get(walker, Drowning)!.breath).toBeCloseTo(DROWNING_BREATH_SECONDS - 1);
  });

  it("drowns instantly, with no grace period, when instant is set", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    digPool(heightmap, 5, 5);
    const walker = createWalker(world, 5.5, 5.5);
    const system = createDrowningSystem({ heightmap, instant: true });

    system(world, 0.01);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("exempts a knight from open-water drowning (unlike swamps, which still drown heroes)", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    digPool(heightmap, 5, 5);
    const knight = createWalker(world, 5.5, 5.5, "knight");
    const system = createDrowningSystem({ heightmap });

    for (let i = 0; i < 20; i++) system(world, 1);

    expect(world.isAlive(knight)).toBe(true);
    expect(world.get(knight, Drowning)).toBeUndefined();
  });

  it("exempts a guardian from drowning too, even under instant mode", () => {
    const world = new World();
    const heightmap = flatHeightmap(10, 10, 5);
    digPool(heightmap, 5, 5);
    const guardian = createWalker(world, 5.5, 5.5, "guardian");
    const system = createDrowningSystem({ heightmap, instant: true });

    system(world, 1);

    expect(world.isAlive(guardian)).toBe(true);
  });
});
