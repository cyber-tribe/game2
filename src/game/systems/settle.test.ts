import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { FactionState, House, MoveTarget, Owner, Position, Walker } from "../components";
import { createFaction } from "../faction";
import { createSettleSystem } from "./settle";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };
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

  function createHouse(world: World, faction: "player" | "enemy", x: number, y: number) {
    const entity = world.createEntity();
    world.add(entity, Position, { x, y });
    world.add(entity, Owner, { faction });
    world.add(entity, House, { level: "hut", population: 0 });
    return entity;
  }

  it("does not settle a walker once its faction is already at maxHousesPerFaction", () => {
    const world = new World();
    createHouse(world, "player", 0, 0);
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    // This is exactly what the stalemate-escape valve in houseGrowth.ts
    // guards against on the other side of house creation: without this
    // cap check here too, a walker already in flight when the faction hit
    // its cap could still settle and quietly push the house count past it
    // — see this system's own SettleConfig.maxHousesPerFaction doc comment.
    createSettleSystem({ maxHousesPerFaction: 1 })(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(1); // still just the pre-existing one
  });

  it("still settles a walker from a faction under the cap, even when another faction is already at it", () => {
    const world = new World();
    createHouse(world, "enemy", 0, 0);
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem({ maxHousesPerFaction: 1 })(world, 0);

    expect(world.isAlive(walker)).toBe(false);
    expect(world.query(House, Owner)).toHaveLength(2);
  });

  it("treats maxHousesPerFaction as unlimited when omitted", () => {
    const world = new World();
    createHouse(world, "player", 0, 0);
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(false);
    expect(world.query(House)).toHaveLength(2);
  });
});
