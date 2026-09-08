import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { Charmed, House, MoveTarget, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { HELEN_CHARM_CAPACITY, HELEN_CHARM_RADIUS } from "../constants";
import { createHouseCaptureSystem, createWalkerCombatSystem } from "./combat";
import { charmedBy, createHelenSystem } from "./helen";
import { createSettleSystem } from "./settle";
import { createSwamp } from "../swamp";
import { createSwampSystem } from "./swamp";

function spawnWalker(world: World, faction: FactionId, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

describe("createHelenSystem", () => {
  it("charms an enemy walker that comes within reach", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 10, 10, "helen");
    const victim = spawnWalker(world, "enemy", 11, 10);

    createHelenSystem()(world, 0.1);

    expect(world.has(victim, Charmed)).toBe(true);
    expect(world.get(victim, Charmed)!.by).toBe(helen);
  });

  it("leaves her own side alone", () => {
    const world = new World();
    spawnWalker(world, "player", 10, 10, "helen");
    const friend = spawnWalker(world, "player", 11, 10);

    createHelenSystem()(world, 0.1);

    expect(world.has(friend, Charmed)).toBe(false);
  });

  it("does not reach past her charm radius", () => {
    const world = new World();
    spawnWalker(world, "player", 10, 10, "helen");
    const far = spawnWalker(world, "enemy", 10 + HELEN_CHARM_RADIUS + 2, 10);

    createHelenSystem()(world, 0.1);

    expect(world.has(far, Charmed)).toBe(false);
  });

  it("holds only as many as she can carry", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 10, 10, "helen");
    for (let i = 0; i < HELEN_CHARM_CAPACITY + 3; i++) spawnWalker(world, "enemy", 10.5, 10);

    createHelenSystem()(world, 0.1);

    expect(charmedBy(world, helen)).toHaveLength(HELEN_CHARM_CAPACITY);
  });

  /** 「建物から引き離し連れ回す」 — the whole effect is being walked away. */
  it("drags whoever she holds along behind her", () => {
    const world = new World();
    spawnWalker(world, "player", 10, 10, "helen");
    const victim = spawnWalker(world, "enemy", 13, 10);

    createHelenSystem()(world, 0.1);

    const target = world.get(victim, MoveTarget)!;
    expect(target.x).toBeLessThan(13);
    expect(target.x).toBeGreaterThanOrEqual(10);
  });

  it("stops the held from settling for their own side", () => {
    const world = new World();
    spawnWalker(world, "player", 10, 10, "helen");
    const victim = spawnWalker(world, "enemy", 11, 10);

    createHelenSystem()(world, 0.1);
    createSettleSystem()(world, 10);

    expect(world.has(victim, MoveTarget)).toBe(true);
    expect(world.get(victim, Walker)!.state).toBe("seeking");
  });

  it("walks her toward the nearest enemy she has not taken", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 10, 10, "helen");
    spawnWalker(world, "enemy", 30, 10);

    createHelenSystem()(world, 0.1);

    expect(world.get(helen, MoveTarget)).toEqual({ x: 30, y: 10 });
  });

  /** 「ヘレンが死ぬと拘束は解ける」 */
  it("releases everyone when she dies", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 10, 10, "helen");
    const victim = spawnWalker(world, "enemy", 11, 10);
    const system = createHelenSystem();
    system(world, 0.1);
    expect(world.has(victim, Charmed)).toBe(true);

    world.destroyEntity(helen);
    system(world, 0.1);

    expect(world.has(victim, Charmed)).toBe(false);
    expect(world.has(victim, MoveTarget)).toBe(false);
  });
});

describe("トロイのヘレン — 敵と戦わない", () => {
  it("kills nobody, however strong she is", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    world.add(helen, Walker, { strength: 99, state: "helen", speed: 1 });
    const soldier = spawnWalker(world, "enemy", 5, 5);

    createWalkerCombatSystem()(world, 0.1);

    expect(world.isAlive(soldier)).toBe(true);
    expect(world.get(soldier, Walker)!.strength).toBe(1);
  });

  /**
   * 「戦闘することが出来ず、**神業でしか潰せない**」. She used to die to
   * anyone who reached her, on the reading that 「敵と戦わない」 meant
   * "cannot win a fight" rather than "cannot be in one" — which made her a
   * problem the enemy answers by walking one spare follower at her.
   * Untouchable by hand, she is a problem the enemy *god* has to spend mana
   * on, which is the pressure the miracle exists to apply.
   */
  it("cannot be killed by a walker, however many reach her", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    world.add(helen, Walker, { strength: 99, state: "helen", speed: 1 });
    spawnWalker(world, "enemy", 5, 5);
    spawnWalker(world, "enemy", 5, 5);

    createWalkerCombatSystem()(world, 0.1);
    createWalkerCombatSystem()(world, 0.1);

    expect(world.isAlive(helen)).toBe(true);
  });

  /** A miracle still ends her — that is what 神業でしか潰せない leaves open. */
  it("still dies to a miracle", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    const swamp = createSwamp(world, 5, 5, 1, 3);

    createSwampSystem()(world, 0.1);

    expect(world.isAlive(helen)).toBe(false);
    expect(world.isAlive(swamp)).toBe(true);
  });

  /**
   * 「敵信者を魅了して**建物を更地にさせ**、信者が死ぬまで外を連れ回し続ける」
   * — the other half of 「敵の人口・建築基盤を崩す」. Without it she only
   * ever cost a faction its people and never touched its 建築基盤.
   */
  it("has the people she holds pull down their own side's houses", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    spawnWalker(world, "enemy", 5.5, 5);
    const house = world.createEntity();
    world.add(house, Position, { x: 5.5, y: 5 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 3 });

    createHelenSystem()(world, 0.1);

    expect(world.isAlive(house)).toBe(false);
  });

  it("does not have them pull down the houses of the side that charmed them", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    spawnWalker(world, "enemy", 5.5, 5);
    const ownHouse = world.createEntity();
    world.add(ownHouse, Position, { x: 5.5, y: 5 });
    world.add(ownHouse, Owner, { faction: "player" });
    world.add(ownHouse, House, { level: "hut", population: 3 });

    createHelenSystem()(world, 0.1);

    expect(world.isAlive(ownHouse)).toBe(true);
  });

  it("leaves a house they are nowhere near standing", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    spawnWalker(world, "enemy", 5.5, 5);
    const distant = world.createEntity();
    world.add(distant, Position, { x: 25, y: 25 });
    world.add(distant, Owner, { faction: "enemy" });
    world.add(distant, House, { level: "hut", population: 3 });

    createHelenSystem()(world, 0.1);

    expect(world.isAlive(distant)).toBe(true);
  });

  /**
   * The charm is what keeps her alive: it reaches six times further than
   * COMBAT_RANGE, so an approaching walker is normally taken well before
   * it can touch her — and once held, it is out of the fight entirely.
   */
  it("is not attacked by the walkers she is already holding", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    const victim = spawnWalker(world, "enemy", 5, 5);
    const helenSystem = createHelenSystem();

    helenSystem(world, 0.1);
    createWalkerCombatSystem()(world, 0.1);

    expect(world.isAlive(helen)).toBe(true);
    expect(world.isAlive(victim)).toBe(true);
  });
});

describe("トロイのヘレン — houses", () => {
  it("walks past an enemy house without touching it", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    world.add(helen, Walker, { strength: 99, state: "helen", speed: 1 });
    const house = world.createEntity();
    world.add(house, Position, { x: 5, y: 5 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 0 });

    createHouseCaptureSystem()(world, 0.1);

    expect(world.isAlive(house)).toBe(true);
    expect(world.get(house, Owner)!.faction).toBe("enemy");
    expect(world.isAlive(helen)).toBe(true);
  });

  it("keeps the walkers she holds from storming houses too", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    const victim = spawnWalker(world, "enemy", 5, 5);
    world.add(victim, Walker, { strength: 99, state: "seeking", speed: 1 });
    const house = world.createEntity();
    world.add(house, Position, { x: 5, y: 5 });
    world.add(house, Owner, { faction: "player" });
    world.add(house, House, { level: "hut", population: 0 });

    createHelenSystem()(world, 0.1);
    createHouseCaptureSystem()(world, 0.1);

    expect(world.get(house, Owner)!.faction).toBe("player");
  });
});
