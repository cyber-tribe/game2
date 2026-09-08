import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { applyEarthquake, createHeightmap, type Heightmap } from "../../world/heightmap";
import { FactionState, Owner, Position, Walker } from "../components";
import { createFaction } from "../faction";
import { createCreviceSystem } from "./crevice";

function flatHeightmap(size: number, elevation: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (const row of heightmap.vertices) row.fill(elevation);
  return heightmap;
}

function spawnWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  world.add(entity, Owner, { faction: "player" });
  return entity;
}

describe("createCreviceSystem", () => {
  it("kills a walker standing on torn ground", () => {
    const heightmap = flatHeightmap(20, 5);
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, () => 0.5);
    const world = new World();
    spawnWalker(world, 8, 10);

    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.query(Walker)).toHaveLength(0);
  });

  it("leaves walkers on intact ground alone", () => {
    const heightmap = flatHeightmap(20, 5);
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, () => 0.5);
    const world = new World();
    spawnWalker(world, 8, 17);

    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.query(Walker)).toHaveLength(1);
  });

  /**
   * The difference between a crevice and merely low ground, and the reason
   * `crevice` is its own layer rather than a test on elevation: walkers
   * stand on low ground quite happily.
   */
  it("does not kill walkers on ground that is merely low", () => {
    const heightmap = flatHeightmap(20, 0);
    const world = new World();
    spawnWalker(world, 8, 10);

    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.query(Walker)).toHaveLength(1);
  });

  /**
   * A crevice persists, so what makes it dangerous is walking into it
   * later — not merely standing there at the moment it opened. This is the
   * whole difference from the old earthquake, which churned the ground and
   * then stopped mattering.
   */
  it("keeps killing on later ticks, not just the tick it opened", () => {
    const heightmap = flatHeightmap(20, 5);
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, () => 0.5);
    const world = new World();
    const system = createCreviceSystem({ heightmap });

    system(world, 0.1);
    spawnWalker(world, 8, 10); // wanders in afterwards
    system(world, 0.1);

    expect(world.query(Walker)).toHaveLength(0);
  });

  it("reports each loss through onImpact", () => {
    const heightmap = flatHeightmap(20, 5);
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, () => 0.5);
    const world = new World();
    spawnWalker(world, 8, 10);
    const impacts: unknown[] = [];

    createCreviceSystem({ heightmap, onImpact: (event) => impacts.push(event) })(world, 0.1);

    expect(impacts).toHaveLength(1);
  });

  it("does nothing at all without a heightmap", () => {
    const world = new World();
    spawnWalker(world, 8, 10);

    expect(() => createCreviceSystem()(world, 0.1)).not.toThrow();
    expect(world.query(Walker)).toHaveLength(1);
  });
});

describe("createCreviceSystem — ヘラクレス", () => {
  /**
   * 「地割れに落ちない」 (docs/original-miracles.md #15) — the other half of
   * the earthquake, and the reason the priciest hero is worth its price on
   * a map somebody has already torn open.
   */
  it("walks a ヘラクレス over torn ground unharmed", () => {
    const heightmap = flatHeightmap(20, 5);
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, () => 0.5);
    const world = new World();
    const hero = spawnWalker(world, 8, 10);
    world.add(hero, Walker, { ...world.get(hero, Walker)!, state: "hercules" });

    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.isAlive(hero)).toBe(true);
  });

  it("still swallows every other hero", () => {
    const heightmap = flatHeightmap(20, 5);
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, () => 0.5);
    const world = new World();
    for (const state of ["perseus", "odysseus", "achilles", "guardian"] as const) {
      const hero = spawnWalker(world, 8, 10);
      world.add(hero, Walker, { ...world.get(hero, Walker)!, state });
    }

    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.query(Walker)).toHaveLength(0);
  });
});

/**
 * The source's own worked example of the blue flame, cast as an
 * earthquake: 「マグネットに重なっている間(青い炎に包まれた状態)は無敵だが、
 * 集まってくるウォーカーが次々に地割れに落ちていくため、集合を解除すること
 * が多い。その瞬間にリーダーも地割れに落ちる」.
 */
describe("creviceSystem and the leader waiting at the magnet", () => {
  const stage = (mode: "gather" | "fight") => {
    const heightmap = flatHeightmap(20, 5);
    // Same fissure the tests above use, with the magnet planted on it.
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, () => 0.5);
    const world = new World();
    const faction = createFaction(world, "player", { x: 8, y: 10 }, mode);
    const leader = world.createEntity();
    world.add(leader, Position, { x: 8, y: 10 });
    world.add(leader, Owner, { faction: "player" });
    world.add(leader, Walker, { strength: 1, state: "seeking", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });
    return { world, leader, heightmap };
  };

  it("cannot swallow it while the order stands", () => {
    const { world, leader, heightmap } = stage("gather");

    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.isAlive(leader)).toBe(true);
  });

  it("swallows it the moment the order is lifted", () => {
    const { world, leader, heightmap } = stage("fight");

    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.isAlive(leader)).toBe(false);
  });
});

