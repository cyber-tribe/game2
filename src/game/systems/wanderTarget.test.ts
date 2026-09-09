import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { MoveTarget, Position, Walker } from "../components";
import { createWanderTargetSystem } from "./wanderTarget";
import { WANDER_OUTWARD_BIAS } from "../constants";
function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

function halfWaterHeightmap(width: number, height: number, landFromX: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () =>
    Array.from({ length: width + 1 }, (_, x) => (x >= landFromX ? 5 : 0)),
  );
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, forest: blankLayer(width, height),
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), wall: blankLayer(width, height), boulder: blankLayer(width, height), waterLevel: 0 };
}

function queueRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("createWanderTargetSystem", () => {
  it("assigns a target to a seeking walker that has none", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const system = createWanderTargetSystem({ radius: 4, rng: () => 0.5 });
    system(world, 1);

    expect(world.has(entity, MoveTarget)).toBe(true);
  });

  it("keeps the target within the configured radius of the walker", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 10, y: 10 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const system = createWanderTargetSystem({ radius: 3, rng: () => Math.random() });
    system(world, 1);

    const target = world.get(entity, MoveTarget)!;
    const distance = Math.hypot(target.x - 10, target.y - 10);
    expect(distance).toBeLessThanOrEqual(3);
  });

  it("does not overwrite an existing target", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
    world.add(entity, MoveTarget, { x: 99, y: 99 });

    const system = createWanderTargetSystem();
    system(world, 1);

    expect(world.get(entity, MoveTarget)).toEqual({ x: 99, y: 99 });
  });

  it("ignores walkers that are not in the seeking state", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "fighting", speed: 1 });

    const system = createWanderTargetSystem();
    system(world, 1);

    expect(world.has(entity, MoveTarget)).toBe(false);
  });

  it("retries past a water candidate to land on buildable ground when given a heightmap", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 5, y: 5 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const heightmap = halfWaterHeightmap(10, 10, 5); // land only where x >= 5
    // 1st attempt: due west, full radius -> clamps to x=0 (water).
    // 2nd attempt: due east, full radius -> clamps to x=10 (land).
    const rng = queueRng([0.5, 1, 0, 1]);
    const system = createWanderTargetSystem({ radius: 10, rng, heightmap });
    system(world, 1);

    expect(world.get(entity, MoveTarget)).toEqual({ x: 10, y: 5 });
  });

  it("still returns a bounded target if every retry lands in water", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 5, y: 5 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const heightmap = halfWaterHeightmap(10, 10, 999); // entirely water
    const system = createWanderTargetSystem({ radius: 10, rng: () => 0.5, maxAttempts: 3, heightmap });

    expect(() => system(world, 1)).not.toThrow();

    const target = world.get(entity, MoveTarget)!;
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.x).toBeLessThanOrEqual(10);
    expect(target.y).toBeGreaterThanOrEqual(0);
    expect(target.y).toBeLessThanOrEqual(10);
  });

  it("clamps the final target to the heightmap's bounds", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const heightmap = halfWaterHeightmap(10, 10, 0); // land everywhere
    const system = createWanderTargetSystem({ radius: 10, rng: () => 0.75, heightmap });
    system(world, 1);

    const target = world.get(entity, MoveTarget)!;
    expect(target.x).toBe(0);
    expect(target.y).toBe(0);
  });
});

/**
 * 「定住：ウォーカーは適当に歩き回り、平地に建物を建てます。マップ中央より
 * は端に向かいやすい傾向があります」 — the walk leans away from the middle
 * of the map. These check the lean, and check that it stays a 傾向: no
 * direction is closed off, and the step is turned rather than lengthened.
 */
describe("createWanderTargetSystem's outward lean", () => {
  function seekerAt(world: World, x: number, y: number) {
    const entity = world.createEntity();
    world.add(entity, Position, { x, y });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
    return entity;
  }

  /** Distance from the map's centre, which the lean should tend to grow. */
  function radiusFromCentre(point: { x: number; y: number }): number {
    return Math.hypot(point.x - 50, point.y - 50);
  }

  it("sends more walkers outward than inward from an off-centre spot", () => {
    const heightmap = halfWaterHeightmap(100, 100, 0); // land everywhere
    let outward = 0;
    let inward = 0;

    for (let roll = 0; roll < 400; roll++) {
      const world = new World();
      // North-west of the centre, well inside the map so nothing clamps.
      const entity = seekerAt(world, 30, 30);
      const rng = queueRng([roll / 400, 0.5]);
      createWanderTargetSystem({ radius: 6, rng, heightmap })(world, 1);

      const target = world.get(entity, MoveTarget)!;
      if (radiusFromCentre(target) > radiusFromCentre({ x: 30, y: 30 })) outward++;
      else inward++;
    }

    expect(outward).toBeGreaterThan(inward);
  });

  it("still lets a walker head inward — a 傾向, not a rule", () => {
    const world = new World();
    const entity = seekerAt(world, 30, 30);
    const heightmap = halfWaterHeightmap(100, 100, 0);
    // An eighth of a turn is due south-east, i.e. straight back at the centre.
    createWanderTargetSystem({ radius: 6, rng: queueRng([0.125, 1]), heightmap })(world, 1);

    const target = world.get(entity, MoveTarget)!;
    expect(radiusFromCentre(target)).toBeLessThan(radiusFromCentre({ x: 30, y: 30 }));
  });

  it("turns the step without lengthening it", () => {
    const world = new World();
    const entity = seekerAt(world, 20, 80);
    const heightmap = halfWaterHeightmap(100, 100, 0);
    createWanderTargetSystem({ radius: 6, rng: queueRng([0.1, 0.5]), heightmap })(world, 1);

    const target = world.get(entity, MoveTarget)!;
    expect(Math.hypot(target.x - 20, target.y - 80)).toBeCloseTo(3, 10);
  });

  it("leaves a walker standing on the centre with a plain uniform roll", () => {
    const world = new World();
    const entity = seekerAt(world, 50, 50);
    const heightmap = halfWaterHeightmap(100, 100, 0);
    createWanderTargetSystem({ radius: 6, rng: queueRng([0.25, 1]), heightmap })(world, 1);

    // A quarter turn is due south at full radius, unturned by any lean.
    const target = world.get(entity, MoveTarget)!;
    expect(target.x).toBeCloseTo(50, 10);
    expect(target.y).toBeCloseTo(56, 10);
  });

  it("restores the old isotropic wander at outwardBias 0", () => {
    const world = new World();
    const entity = seekerAt(world, 30, 30);
    const heightmap = halfWaterHeightmap(100, 100, 0);
    createWanderTargetSystem({ radius: 6, rng: queueRng([0.25, 1]), outwardBias: 0, heightmap })(world, 1);

    const target = world.get(entity, MoveTarget)!;
    expect(target.x).toBeCloseTo(30, 10);
    expect(target.y).toBeCloseTo(36, 10);
  });

  it("keeps the shipped bias a lean rather than a march to the edge", () => {
    expect(WANDER_OUTWARD_BIAS).toBeGreaterThan(0);
    expect(WANDER_OUTWARD_BIAS).toBeLessThan(1);
  });
});
