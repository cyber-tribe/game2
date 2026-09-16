import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { Charmed, House, MoveTarget, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { HELEN_CAPTIVE_DRAIN_RATE, HELEN_CHARM_RADIUS } from "../constants";
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

  /**
   * 「戦闘を行わないためにパワーの減りが遅く、かなり多くの敵ウォーカーを
   * 拘束出来る」 — no cap. What bounds her is that the ones she takes wear
   * out (see the drain tests below), not a number game2 invented.
   */
  it("takes everyone in reach, however many that is", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 10, 10, "helen");
    for (let i = 0; i < 12; i++) spawnWalker(world, "enemy", 10.5, 10);

    createHelenSystem()(world, 0.1);

    expect(charmedBy(world, helen)).toHaveLength(12);
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
   * 「敵建物に接触して竪琴を一閃すると建物が消滅し、現れたウォーカーを拘束
   * する」 — she levels the building herself, and the people who were inside
   * come out already hers. This used to have the *charmed* pull down their
   * own side's houses instead (plan/archived/0133), on a compressed reading of the
   * catalogue article.
   */
  it("levels an enemy house she reaches", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    const house = world.createEntity();
    world.add(house, Position, { x: 5.5, y: 5 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 3 });

    createHelenSystem()(world, 0.1);

    expect(world.isAlive(house)).toBe(false);
  });

  it("takes the people who were inside it, carrying that house's whole population", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    const house = world.createEntity();
    world.add(house, Position, { x: 5.5, y: 5 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 7 });

    createHelenSystem()(world, 0.1);

    const [freed] = charmedBy(world, helen);
    expect(freed).toBeDefined();
    expect(world.get(freed, Owner)).toEqual({ faction: "enemy" });
    // Rounded down by one tick of the drain, which runs before she acts.
    expect(world.get(freed, Walker)!.strength).toBeCloseTo(7);
  });

  it("still turns out one person from an empty house — somebody opened the door", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    const house = world.createEntity();
    world.add(house, Position, { x: 5.5, y: 5 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 0 });

    createHelenSystem()(world, 0.1);

    expect(charmedBy(world, helen)).toHaveLength(1);
  });

  /**
   * A razed house's id must not come back as the person who walked out of
   * it. World recycles ids the instant one is freed, so creating the walker
   * after the destroy hands it the house's own id and every handle anyone
   * still holds to that house starts reporting a live building — see
   * systems/effects.ts, and razeReachedHouses for the ordering that avoids
   * it. This caught it the first time.
   */
  it("does not hand the freed walker the razed house's own entity id", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 5, 5, "helen");
    const house = world.createEntity();
    world.add(house, Position, { x: 5.5, y: 5 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 3 });

    createHelenSystem()(world, 0.1);

    expect(world.isAlive(house)).toBe(false);
    expect(charmedBy(world, helen)).not.toContain(house);
  });

  it("leaves her own side's houses alone", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    const ownHouse = world.createEntity();
    world.add(ownHouse, Position, { x: 5.5, y: 5 });
    world.add(ownHouse, Owner, { faction: "player" });
    world.add(ownHouse, House, { level: "hut", population: 3 });

    createHelenSystem()(world, 0.1);

    expect(world.isAlive(ownHouse)).toBe(true);
  });

  it("leaves a house she is nowhere near standing", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    const distant = world.createEntity();
    world.add(distant, Position, { x: 25, y: 25 });
    world.add(distant, Owner, { faction: "enemy" });
    world.add(distant, House, { level: "hut", population: 3 });

    createHelenSystem()(world, 0.1);

    expect(world.isAlive(distant)).toBe(true);
  });

  /** 「最も近い敵ウォーカーまたは敵建物を目指して」. */
  it("walks toward an enemy house when there is no walker to take", () => {
    const world = new World();
    const helen = spawnWalker(world, "player", 0, 0, "helen");
    const house = world.createEntity();
    world.add(house, Position, { x: 9, y: 0 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 1 });

    createHelenSystem()(world, 0.1);

    expect(world.get(helen, MoveTarget)).toEqual({ x: 9, y: 0 });
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
  /**
   * She takes a house apart in her own system, never through the assault
   * path: 「戦闘することが出来ず」 means she must not be consumed capturing
   * one, and what she leaves is level ground, not a captured building.
   */
  it("never captures a house the way a walker does", () => {
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

/** 「拘束した敵ウォーカーは歩き回っているうちに次第にパワーが減少し、力尽きると死んでしまう」. */
describe("トロイのヘレン — 拘束した者は力尽きる", () => {
  it("wears a captive down as she leads it around", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    const captive = spawnWalker(world, "enemy", 5.5, 5);
    const helenSystem = createHelenSystem();

    helenSystem(world, 0.1); // charmed here
    helenSystem(world, 1);

    expect(world.get(captive, Walker)!.strength).toBeCloseTo(1 - HELEN_CAPTIVE_DRAIN_RATE);
  });

  it("kills one that runs out", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    const captive = spawnWalker(world, "enemy", 5.5, 5);
    const helenSystem = createHelenSystem();

    helenSystem(world, 0.1);
    helenSystem(world, 1 / HELEN_CAPTIVE_DRAIN_RATE);

    expect(world.isAlive(captive)).toBe(false);
  });

  it("leaves a walker nobody is holding at full strength", () => {
    const world = new World();
    const free = spawnWalker(world, "enemy", 30, 30);

    createHelenSystem()(world, 100);

    expect(world.get(free, Walker)!.strength).toBe(1);
  });

  /** A castle's worth of prisoners lasts proportionally longer, not forever. */
  it("takes longer over a crowd than over one person", () => {
    const world = new World();
    spawnWalker(world, "player", 5, 5, "helen");
    const house = world.createEntity();
    world.add(house, Position, { x: 5.5, y: 5 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "castle", population: 60 });
    const helenSystem = createHelenSystem();

    helenSystem(world, 0.1);
    helenSystem(world, 1 / HELEN_CAPTIVE_DRAIN_RATE);

    expect(world.query(Charmed)).toHaveLength(1);
  });
});
