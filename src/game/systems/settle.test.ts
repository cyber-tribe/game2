import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { FactionState, House, MoveTarget, Owner, Position, Walker } from "../components";
import { HOUSE_SPACING, HOUSE_UPGRADE_FLATNESS_RADIUS } from "../constants";
import { createFaction } from "../faction";
import { createSettleSystem } from "./settle";
function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, forest: blankLayer(width, height),
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), wall: blankLayer(width, height), boulder: blankLayer(width, height), waterLevel: 0 };
}

/**
 * Dry land with no two adjacent vertices at the same height, so
 * countFlatNeighbors returns 5 of 25 anywhere on it — below
 * HOUSE_SETTLE_FLATNESS_REQUIREMENT, and so unsettleable.
 */
function bumpyHeightmap(width: number, height: number): Heightmap {
  const heightmap = flatHeightmap(width, height, 1);
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) heightmap.vertices[y][x] = 1 + ((x * 3 + y * 7) % 5);
  }
  return heightmap;
}

describe("createSettleSystem", () => {
  it("turns an arrived seeking walker into a hut owned by the same faction", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(false);

    const houses = world.query(House);
    expect(houses).toHaveLength(1);
    const [house] = houses;
    expect(world.get(house, Position)).toEqual({ x: 3, y: 4 });
    expect(world.get(house, Owner)).toEqual({ faction: "player" });
    expect(world.get(house, House)).toEqual({ level: "hut", population: 0 });
  });

  it("leaves a walker alone while it still has a MoveTarget", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 0, y: 0 });
    world.add(walker, Owner, { faction: "enemy" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });
    world.add(walker, MoveTarget, { x: 5, y: 5 });

    createSettleSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });

  it("does not settle a walker that is not in the seeking state", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 0, y: 0 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "fighting", speed: 1 });

    createSettleSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });

  it("settles on land when a heightmap says the spot is buildable", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 2, y: 2 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem({ heightmap: flatHeightmap(4, 4, 5) })(world, 0);

    expect(world.isAlive(walker)).toBe(false);
    expect(world.query(House)).toHaveLength(1);
  });

  it("refuses to settle underwater, leaving the walker to be re-targeted next tick", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 2, y: 2 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem({ heightmap: flatHeightmap(4, 4, 0) })(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.has(walker, MoveTarget)).toBe(false);
    expect(world.query(House)).toHaveLength(0);
  });

  it("never settles a walker whose faction is in the final battle", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, finalBattle: true });
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });

  it("does not settle on ground too rough to build on, even though it is dry land", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    // Dry and unspoiled, so isBuildable is happy — but no two neighbouring
    // vertices share a height, so there is nowhere flat to put a house.
    // This is the whole expansion limit now that the house cap is gone
    // (plan/0118-terrain-based-house-limit.md).
    createSettleSystem({ heightmap: bumpyHeightmap(8, 8) })(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });

  it("settles once that same rough ground is levelled under the walker", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    const heightmap = bumpyHeightmap(8, 8);
    for (let y = 4 - HOUSE_UPGRADE_FLATNESS_RADIUS; y <= 4 + HOUSE_UPGRADE_FLATNESS_RADIUS; y++) {
      for (let x = 3 - HOUSE_UPGRADE_FLATNESS_RADIUS; x <= 3 + HOUSE_UPGRADE_FLATNESS_RADIUS; x++) {
        heightmap.vertices[y][x] = 3;
      }
    }

    createSettleSystem({ heightmap })(world, 0);

    expect(world.isAlive(walker)).toBe(false);
    expect(world.query(House)).toHaveLength(1);
  });

  it("has no per-faction house cap: land is the only thing that runs out", () => {
    const world = new World();
    const heightmap = flatHeightmap(64, 64, 3);
    // Ten walkers, each HOUSE_SPACING apart on ground that is flat
    // everywhere. The old cap would have stopped this faction dead at a
    // fixed count regardless of how much room it had.
    for (let i = 0; i < 10; i++) createWalker(world, "player", 2 + i * HOUSE_SPACING, 2);

    createSettleSystem({ heightmap })(world, 0);

    expect(world.query(House)).toHaveLength(10);
    expect(world.query(Walker)).toHaveLength(0);
  });

  it("never settles a gather-mode leader while someone else is still gathering", () => {
    const world = new World();
    const leader = world.createEntity();
    world.add(leader, Position, { x: 3, y: 4 });
    world.add(leader, Owner, { faction: "player" });
    world.add(leader, Walker, { strength: 1, state: "seeking", speed: 1 });
    const follower = world.createEntity(); // still on its way — see gatherTargeting.ts
    world.add(follower, Owner, { faction: "player" });
    world.add(follower, Walker, { strength: 1, state: "seeking", speed: 1 });
    const faction = createFaction(world, "player", { x: 0, y: 0 }, "gather");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    createSettleSystem()(world, 0);

    expect(world.isAlive(leader)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });

  it("settles a gather-mode leader once nobody else is left to gather", () => {
    const world = new World();
    const leader = world.createEntity();
    world.add(leader, Position, { x: 3, y: 4 });
    world.add(leader, Owner, { faction: "player" });
    world.add(leader, Walker, { strength: 1, state: "seeking", speed: 1 });
    const faction = createFaction(world, "player", { x: 0, y: 0 }, "gather");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    createSettleSystem()(world, 0);

    expect(world.isAlive(leader)).toBe(false);
    expect(world.query(House)).toHaveLength(1);
  });
});

function createWalker(world: World, faction: "player" | "enemy", x: number, y: number) {
  const walker = world.createEntity();
  world.add(walker, Position, { x, y });
  world.add(walker, Owner, { faction });
  world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });
  return walker;
}

describe("createSettleSystem — spacing", () => {
  /**
   * There was no spacing rule at all, so walkers standing on the same spot
   * founded houses on the same spot: measured on the final world, one
   * faction held three houses at *identical* coordinates at 40 seconds.
   * Stacked houses are invisible, pay full mana each, and die together to
   * anything with a radius (plan/0107).
   */
  it("does not stack a house on top of one that is already there", () => {
    const world = new World();
    createWalker(world, "player", 5, 5);
    createWalker(world, "player", 5, 5);
    createWalker(world, "player", 5, 5);

    createSettleSystem()(world, 1);

    expect(world.query(House)).toHaveLength(1);
  });

  it("leaves the refused walkers seeking, so they settle elsewhere later", () => {
    const world = new World();
    createWalker(world, "player", 5, 5);
    const second = createWalker(world, "player", 5, 5);

    createSettleSystem()(world, 1);

    expect(world.isAlive(second)).toBe(true);
    expect(world.get(second, Walker)!.state).toBe("seeking");
  });

  it("still settles a walker standing clear of every house", () => {
    const world = new World();
    createWalker(world, "player", 5, 5);
    createWalker(world, "player", 12, 12);

    createSettleSystem()(world, 1);

    expect(world.query(House)).toHaveLength(2);
  });
});
