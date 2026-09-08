import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { FirePillar, House, Owner, Position, Walker } from "./components";
import { VOLCANO_FIRE_PILLARS, VOLCANO_FIRE_PILLAR_RING } from "./constants";
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

/** 火山は火の神技なので「※アキレス以外」——溶岩に埋まって焼死するのは他の全員である。 */
describe("eruptVolcano and the fire school's own hero", () => {
  it("leaves アキレス standing in the lava", () => {
    const world = new World();
    const achilles = world.createEntity();
    world.add(achilles, Position, { x: 4, y: 4 });
    world.add(achilles, Owner, { faction: "player" });
    world.add(achilles, Walker, { strength: 1, state: "achilles", speed: 1 });

    eruptVolcano(world, [{ x: 4, y: 4 }]);

    expect(world.isAlive(achilles)).toBe(true);
  });

  it("still buries every other hero", () => {
    const world = new World();
    const hercules = world.createEntity();
    world.add(hercules, Position, { x: 4, y: 4 });
    world.add(hercules, Owner, { faction: "player" });
    world.add(hercules, Walker, { strength: 1, state: "hercules", speed: 1 });

    eruptVolcano(world, [{ x: 4, y: 4 }]);

    expect(world.isAlive(hercules)).toBe(false);
  });
});

/**
 * 原作「火山からは火柱が数本発生する」. The eruption's aftermath, and what
 * keeps 火山 dangerous once the ground has stopped moving.
 */
describe("eruptVolcano's own 火柱", () => {
  it("throws out 数本 of them, aimed away from the crater", () => {
    const world = new World();

    eruptVolcano(world, [], { x: 30, y: 30 }, () => 0.5);

    const pillars = [...world.query(FirePillar, Position)];
    expect(pillars).toHaveLength(VOLCANO_FIRE_PILLARS);
    for (const entity of pillars) {
      const pos = world.get(entity, Position)!;
      const pillar = world.get(entity, FirePillar)!;
      // Born on the ring, heading straight out from the centre.
      expect(Math.hypot(pos.x - 30, pos.y - 30)).toBeCloseTo(VOLCANO_FIRE_PILLAR_RING, 6);
      const outward = { x: (pos.x - 30) / VOLCANO_FIRE_PILLAR_RING, y: (pos.y - 30) / VOLCANO_FIRE_PILLAR_RING };
      expect(pillar.headingX).toBeCloseTo(outward.x, 6);
      expect(pillar.headingY).toBeCloseTo(outward.y, 6);
    }
  });

  /**
   * A 火柱 leans uphill (see systems/firePillar.ts), so one born on the
   * cone would climb back up the mountain and burn nothing. They start
   * clear of it.
   */
  it("starts them clear of the cone rather than on its slope", () => {
    const world = new World();

    eruptVolcano(world, [], { x: 30, y: 30 }, () => 0.5);

    for (const entity of world.query(FirePillar, Position)) {
      const pos = world.get(entity, Position)!;
      expect(Math.hypot(pos.x - 30, pos.y - 30)).toBeGreaterThan(2); // outside cone and puddles
    }
  });

  it("never drops them all on one side", () => {
    const world = new World();

    eruptVolcano(world, [], { x: 30, y: 30 }, () => 0.5);

    const angles = [...world.query(FirePillar, Position)].map((entity) => {
      const pos = world.get(entity, Position)!;
      return Math.atan2(pos.y - 30, pos.x - 30);
    });

    // Evenly spaced before the jitter, so no two share a quadrant's worth
    // of arc even at the extremes of the roll.
    for (let i = 0; i < angles.length; i++) {
      for (let j = i + 1; j < angles.length; j++) {
        let gap = Math.abs(angles[i] - angles[j]);
        if (gap > Math.PI) gap = Math.PI * 2 - gap;
        expect(gap).toBeGreaterThan(0.5);
      }
    }
  });

  it("raises none at all when no crater is given", () => {
    const world = new World();

    eruptVolcano(world, []);

    expect([...world.query(FirePillar)]).toHaveLength(0);
  });

  /**
   * World hands a destroyed entity's id straight back to the next
   * createEntity (see systems/effects.ts), so the pillars have to go up
   * before anything is buried — otherwise a caller asking about what it
   * just lost is told it survived.
   */
  it("does not hand a buried house's id to one of its own pillars", () => {
    const world = new World();
    const house = createHouse(world, 10, 10);

    eruptVolcano(world, [{ x: 10, y: 10 }], { x: 10, y: 10 }, () => 0.5);

    expect(world.isAlive(house)).toBe(false);
  });
});
