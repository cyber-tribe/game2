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

/** The vertices a radius-1 eruption's cone covers, before any lava flow. */
const CONE_AT_5_5 = [
  { x: 4, y: 4 },
  { x: 5, y: 4 },
  { x: 6, y: 4 },
  { x: 4, y: 5 },
  { x: 5, y: 5 },
  { x: 6, y: 5 },
  { x: 4, y: 6 },
  { x: 5, y: 6 },
  { x: 6, y: 6 },
];

describe("eruptVolcano", () => {
  it("destroys a house on covered ground", () => {
    const world = new World();
    const house = createHouse(world, 5, 5);

    eruptVolcano(world, CONE_AT_5_5);

    expect(world.isAlive(house)).toBe(false);
  });

  it("destroys a walker on covered ground, matching by nearest vertex", () => {
    const world = new World();
    const walker = createWalker(world, 5.4, 5);

    eruptVolcano(world, CONE_AT_5_5);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("destroys a house on a corner of the cone's square footprint", () => {
    // applyVolcano covers a (2*radius+1)^2 *square* of vertices, so the
    // corner is covered even though it is radius*sqrt(2) away — see this
    // function's doc comment on why the two must not disagree.
    const world = new World();
    const house = createHouse(world, 6, 6);

    eruptVolcano(world, CONE_AT_5_5);

    expect(world.isAlive(house)).toBe(false);
  });

  it("leaves houses and walkers on untouched ground alone", () => {
    const world = new World();
    const house = createHouse(world, 20, 20);
    const walker = createWalker(world, 20, 20);

    eruptVolcano(world, CONE_AT_5_5);

    expect(world.isAlive(house)).toBe(true);
    expect(world.isAlive(walker)).toBe(true);
  });

  /**
   * The reason this takes covered vertices rather than a centre and
   * radius: lava runs downhill, so what an eruption actually buries is a
   * long irregular tongue that no radius describes.
   */
  it("destroys what a distant lava tongue reached, far outside the cone", () => {
    const world = new World();
    const house = createHouse(world, 5, 18);

    eruptVolcano(world, [...CONE_AT_5_5, { x: 5, y: 18 }]);

    expect(world.isAlive(house)).toBe(false);
  });
});
