import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { House, Owner, Position, Walker } from "./components";
import { eruptVolcano } from "./volcano";

function createHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

function createWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("eruptVolcano", () => {
  it("destroys a house within the blast radius", () => {
    const world = new World();
    const house = createHouse(world, 5, 5);

    eruptVolcano(world, 5, 5, 1);

    expect(world.isAlive(house)).toBe(false);
  });

  it("destroys a walker within the blast radius", () => {
    const world = new World();
    const walker = createWalker(world, 5.5, 5);

    eruptVolcano(world, 5, 5, 1);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("destroys a house on a corner vertex of the blast's square footprint", () => {
    // applyVolcano turns a (2*radius+1)^2 *square* of vertices to rock, but
    // a Euclidean radius check would miss this corner (distance
    // radius*sqrt(2) > radius), leaving a house standing on newly-unbuildable
    // rock — see this function's doc comment.
    const world = new World();
    const house = createHouse(world, 6, 6);

    eruptVolcano(world, 5, 5, 1);

    expect(world.isAlive(house)).toBe(false);
  });

  it("leaves houses and walkers outside the blast radius alone", () => {
    const world = new World();
    const house = createHouse(world, 20, 20);
    const walker = createWalker(world, 20, 20);

    eruptVolcano(world, 5, 5, 1);

    expect(world.isAlive(house)).toBe(true);
    expect(world.isAlive(walker)).toBe(true);
  });
});
