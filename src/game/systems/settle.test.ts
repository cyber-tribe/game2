import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { FactionState, House, MoveTarget, Owner, Position, Walker } from "../components";
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

  /**
   * 「集合：…その間、平地があっても新たな建物は一切建てない」. Mustering is
   * not settling: a follower that catches up to its leader loses its
   * MoveTarget, and this system used to build a house on the spot, so the
   * order to gather an army scattered a line of huts across the map.
   */
  it("builds nothing for a faction whose standing order is 集結シンボルへ", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    for (const entity of world.query(FactionState)) {
      const state = world.get(entity, FactionState)!;
      world.add(entity, FactionState, { ...state, behaviorMode: "goToShrine" });
    }
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(true);
    expect(world.query(House)).toHaveLength(0);
  });

  /**
   * 合体 is not 集合. 「近くに他の信者がいない場合は定住に同じ」 — a walker
   * that has run out of people to merge with keeps building, which is the
   * whole reason to give this order instead of 集結: the economy never
   * stops. mergeTargetingSystem holds back the ones that still have a
   * partner in range by giving them a MoveTarget, so anyone who reaches
   * this system under 合体 is by definition alone.
   */
  it("still builds under 合体, unlike 集結シンボルへ", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    for (const entity of world.query(FactionState)) {
      const state = world.get(entity, FactionState)!;
      world.add(entity, FactionState, { ...state, behaviorMode: "merge" });
    }
    const walker = world.createEntity();
    world.add(walker, Position, { x: 3, y: 4 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(false);
    expect(world.query(House)).toHaveLength(1);
  });

  it("still lets another faction settle while one is mustering", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    createFaction(world, "enemy", { x: 9, y: 9 });
    for (const entity of world.query(FactionState)) {
      const state = world.get(entity, FactionState)!;
      if (state.id !== "player") continue;
      world.add(entity, FactionState, { ...state, behaviorMode: "goToShrine" });
    }
    const enemyWalker = world.createEntity();
    world.add(enemyWalker, Position, { x: 3, y: 4 });
    world.add(enemyWalker, Owner, { faction: "enemy" });
    world.add(enemyWalker, Walker, { strength: 1, state: "seeking", speed: 1 });

    createSettleSystem()(world, 0);

    expect(world.query(House)).toHaveLength(1);
    expect(world.get(world.query(House)[0], Owner)).toEqual({ faction: "enemy" });
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
