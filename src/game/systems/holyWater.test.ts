import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { createFaction } from "../faction";
import { createHolyWater } from "../holyWater";
import { leaderSystem } from "./leader";
import { createHolyWaterSystem } from "./holyWater";

function spawnWalker(world: World, faction: FactionId, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

describe("createHolyWaterSystem", () => {
  it("turns an enemy walker that steps in", () => {
    const world = new World();
    createHolyWater(world, "player", 10, 10);
    const walker = spawnWalker(world, "enemy", 10, 10);

    createHolyWaterSystem()(world, 0.1);

    expect(world.get(walker, Owner)!.faction).toBe("player");
  });

  it("leaves the spring's own side alone", () => {
    const world = new World();
    createHolyWater(world, "player", 10, 10);
    const walker = spawnWalker(world, "player", 10, 10);

    createHolyWaterSystem()(world, 0.1);

    expect(world.get(walker, Owner)!.faction).toBe("player");
  });

  it("does not reach past its radius", () => {
    const world = new World();
    createHolyWater(world, "player", 10, 10, 1.5);
    const walker = spawnWalker(world, "enemy", 14, 10);

    createHolyWaterSystem()(world, 0.1);

    expect(world.get(walker, Owner)!.faction).toBe("enemy");
  });

  /**
   * 「英雄まで寝返る可能性があり、強い英雄を奪えば形勢逆転できる」
   * (docs/original-miracles.md #27) — the whole reason this miracle is
   * worth its price, and the reason it only became interesting once the
   * heroes had identities of their own.
   */
  it("takes an enemy hero, keeping everything it is except its side", () => {
    const world = new World();
    createHolyWater(world, "player", 10, 10);
    const hero = spawnWalker(world, "enemy", 10, 10, "hercules");
    world.add(hero, Walker, { strength: 12, state: "hercules", speed: 1.5 });

    createHolyWaterSystem()(world, 0.1);

    expect(world.get(hero, Owner)!.faction).toBe("player");
    expect(world.get(hero, Walker)).toMatchObject({ strength: 12, state: "hercules", speed: 1.5 });
  });

  it("dries up once it has taken its capacity", () => {
    const world = new World();
    const spring = createHolyWater(world, "player", 10, 10, 1.5, 2);
    spawnWalker(world, "enemy", 10, 10);
    spawnWalker(world, "enemy", 10, 10);
    spawnWalker(world, "enemy", 10, 10);

    createHolyWaterSystem()(world, 0.1);

    expect(world.isAlive(spring)).toBe(false);
    expect(world.query(Owner, Walker).filter((e) => world.get(e, Owner)!.faction === "enemy")).toHaveLength(1);
  });

  /**
   * 「再度落ちると元へ戻る場合もある」 — not a rule of its own. A spring
   * only takes walkers that are not already its owner's, so a walker taken
   * by one side and later caught by the other side's spring simply changes
   * back.
   */
  it("hands a walker back when it falls into the other side's spring", () => {
    const world = new World();
    createHolyWater(world, "player", 10, 10);
    createHolyWater(world, "enemy", 20, 20);
    const walker = spawnWalker(world, "enemy", 10, 10);

    createHolyWaterSystem()(world, 0.1);
    expect(world.get(walker, Owner)!.faction).toBe("player");

    world.add(walker, Position, { x: 20, y: 20 });
    createHolyWaterSystem()(world, 0.1);
    expect(world.get(walker, Owner)!.faction).toBe("enemy");
  });

  it("reports each conversion so the player sees it happen", () => {
    const world = new World();
    createHolyWater(world, "player", 10, 10);
    spawnWalker(world, "enemy", 10, 10);
    const events: string[] = [];

    createHolyWaterSystem({ onImpact: (event) => events.push(event.type) })(world, 0.1);

    expect(events).toEqual(["converted"]);
  });

  /**
   * A faction whose leader defects keeps pointing at it otherwise — it
   * would steer its own gather toward an enemy unit, and spend a hero
   * miracle promoting one.
   */
  it("lets the robbed faction elect a new leader instead of keeping the defector", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 20, y: 20 }, "gather");
    createHolyWater(world, "player", 10, 10);
    const leader = spawnWalker(world, "enemy", 10, 10);
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, leaderId: leader });
    const replacement = spawnWalker(world, "enemy", 20, 20);

    createHolyWaterSystem()(world, 0.1);
    leaderSystem(world, 0.1);

    expect(world.get(enemy, FactionState)!.leaderId).toBe(replacement);
  });
});

/** 聖水の泉「※トロイのヘレン除く」 — 水 の神技なので、水 の英雄は寝返らない。 */
describe("holyWaterSystem and the water school's own hero", () => {
  it("does not turn トロイのヘレン", () => {
    const world = new World();
    const helen = spawnWalker(world, "enemy", 5, 5, "helen");
    createHolyWater(world, "player", 5, 5);

    createHolyWaterSystem()(world, 0.1);

    expect(world.get(helen, Owner)).toEqual({ faction: "enemy" });
  });

  it("still turns a hero from any other school", () => {
    const world = new World();
    const perseus = spawnWalker(world, "enemy", 5, 5, "perseus");
    createHolyWater(world, "player", 5, 5);

    createHolyWaterSystem()(world, 0.1);

    expect(world.get(perseus, Owner)).toEqual({ faction: "player" });
  });
});
