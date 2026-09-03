import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { House, MoveTarget, Owner, Position, Walker } from "../components";
import { settleSystem } from "./settle";

describe("settleSystem", () => {
  it("turns an arrived seeking walker into a hut owned by the same faction", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    settleSystem(world, 0);

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

    settleSystem(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });

  it("does not settle a walker that is not in the seeking state", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 0, y: 0 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "fighting", speed: 1 });

    settleSystem(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });
});
