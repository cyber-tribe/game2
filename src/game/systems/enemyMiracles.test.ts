import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { FactionState, House, Infected, Owner, Position, Swamp, Walker } from "../components";
import {
  ARMAGEDDON_MANA_COST,
  ARMAGEDDON_POPULATION_RATIO,
  EARTHQUAKE_MANA_COST,
  GUARDIAN_MANA_COST,
  PERSEUS_MANA_COST,
  VOLCANO_MANA_COST,
  VOLCANO_POPULATION_RATIO,
} from "../constants";
import { createFaction } from "../faction";
import { createEnemyMiracleSystem } from "./enemyMiracles";
function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, forest: blankLayer(width, height),
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), wall: blankLayer(width, height), boulder: blankLayer(width, height), waterLevel: 0 };
}

function createHouse(world: World, faction: "player" | "enemy", x: number, y: number, population = 0) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population });
  return entity;
}

function createWalker(world: World, faction: "player" | "enemy", state: Walker["state"] = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

const WORLD_CENTER = { x: 10, y: 10 };

describe("createEnemyMiracleSystem", () => {
  it("is a no-op when no heightmap or worldCenter is given", () => {
    const world = new World();
    createFaction(world, "enemy", { x: 0, y: 0 });

    expect(() => createEnemyMiracleSystem()(world, 10)).not.toThrow();
  });

  it("triggers final battle once its population lead is decisive and it can afford it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 20); // 20 vs 1 -> well past the ratio
    createHouse(world, "player", 8, 8, 1);

    const events: unknown[] = [];
    const system = createEnemyMiracleSystem({
      decisionInterval: 8,
      minArmageddonTime: 0, // not testing the elapsed-time floor here — see the dedicated tests below
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    });
    system(world, 8);

    expect(world.get(enemy, FactionState)!.finalBattle).toBe(true);
    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    expect(events).toEqual([{ type: "armageddon" }]);
  });

  it("won't trigger final battle before minArmageddonTime has elapsed, however decisive the lead", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 20);
    createHouse(world, "player", 8, 8, 1);

    const events: unknown[] = [];
    const system = createEnemyMiracleSystem({
      decisionInterval: 8,
      minArmageddonTime: 100,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    });
    system(world, 8); // only 8s elapsed, well under the 100s floor

    expect(world.get(enemy, FactionState)!.finalBattle).toBeUndefined();
    expect(events.some((e) => (e as { type: string }).type === "armageddon")).toBe(false);
  });

  it("triggers final battle once minArmageddonTime has elapsed, across several decision passes", () => {
    const world = new World();
    // No mana yet — deliberately can't afford any fallback miracle (knight/
    // volcano/earthquake) on the first call below, so that call is a total
    // no-op and this test isolates the elapsed-time gate itself.
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 20);
    createHouse(world, "player", 8, 8, 1);

    const events: unknown[] = [];
    const system = createEnemyMiracleSystem({
      decisionInterval: 8,
      minArmageddonTime: 10,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    });
    system(world, 8); // elapsed=8, under the 10s floor, and no mana to afford anything anyway

    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    system(world, 8); // elapsed=16, past the floor: armageddon fires

    expect(world.get(enemy, FactionState)!.finalBattle).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === "armageddon")).toBe(true);
  });

  it("does not trigger final battle without a decisive population lead", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 5);
    createHouse(world, "player", 8, 8, 5); // even population

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER })(world, 8);

    expect(world.get(enemy, FactionState)!.finalBattle).toBeUndefined();
  });

  it("knights its leader once aggressive, if it can afford it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy");
    world.add(enemy, FactionState, {
      ...world.get(enemy, FactionState)!,
      mana: PERSEUS_MANA_COST,
      leaderId: leader,
    });
    createFaction(world, "player", { x: 9, y: 9 });

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(leader, Walker)!.state).toBe("perseus");
    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    expect(events).toEqual([{ type: "perseus" }]);
  });

  it("guardians instead of knighting its leader when meaningfully behind on population", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy");
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: GUARDIAN_MANA_COST, leaderId: leader });
    createHouse(world, "enemy", 0, 0, 5);
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 9, 9, 20); // 5/20 = well below the "even" 1.0 line

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(leader, Walker)!.state).toBe("guardian");
    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    expect(events).toEqual([{ type: "guardian" }]);
  });

  it("does not fall back to knight when behind on population but guardian isn't unlocked", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy");
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: PERSEUS_MANA_COST, leaderId: leader });
    createHouse(world, "enemy", 0, 0, 5);
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 9, 9, 20);

    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      allowedMiracles: ["earthquake", "perseus"], // guardian deliberately absent
    })(world, 8);

    // The AI's read of the fight ("we're behind, defend") isn't unlocked as
    // guardian here, and it doesn't second-guess itself into knighting
    // instead — see createEnemyMiracleSystem's own doc comment.
    expect(world.get(leader, Walker)!.state).toBe("seeking");
  });

  it("does not guardian an already-guardian leader", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy", "guardian");
    // Too little mana for any other branch (earthquake's 20 included), so
    // the only way this test's assertion could fail is the hero branch
    // itself recasting guardian on an already-guardian leader.
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: 1, leaderId: leader });
    createHouse(world, "enemy", 0, 0, 5);
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 9, 9, 20); // keeps the enemy "behind", so guardian stays its preferred kind

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(1); // untouched — nothing to guardian
  });

  it("does not knight an already-knighted leader", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy", "perseus");
    world.add(enemy, FactionState, {
      ...world.get(enemy, FactionState)!,
      mana: PERSEUS_MANA_COST,
      leaderId: leader,
    });
    createFaction(world, "player", { x: 9, y: 9 });

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(PERSEUS_MANA_COST); // untouched — nothing to knight
  });

  it("casts an earthquake on a random opponent house when nothing higher-priority applies", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    const heightmap = flatHeightmap(10, 10, 5);
    const events: unknown[] = [];
    const system = createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap,
      worldCenter: WORLD_CENTER,
      rng: () => 0,
      onAction: (event) => events.push(event),
    });
    system(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    // The whole neighborhood around (5, 5) should no longer be uniformly flat.
    const touched = heightmap.vertices.some((row) => row.some((h) => h !== 5));
    expect(touched).toBe(true);
    expect(events).toEqual([{ type: "earthquake", position: { x: 5, y: 5 } }]);
  });

  it("escalates to a volcano once its population lead is real but not yet decisive, if it can afford it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 0, 0, 13);
    const target = createHouse(world, "player", 5, 5, 10); // ratio 1.3 -> past VOLCANO_POPULATION_RATIO, short of armageddon's 1.8

    const heightmap = flatHeightmap(10, 10, 5);
    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap,
      worldCenter: WORLD_CENTER,
      rng: () => 0,
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(0);
    expect(world.isAlive(target)).toBe(false); // eruptVolcano destroys anything it lands on
    expect(heightmap.rockHardness[5][5]).toBeGreaterThan(0);
    expect(events).toEqual([{ type: "volcano", position: { x: 5, y: 5 } }]);
  });

  it("does not escalate to a volcano below VOLCANO_POPULATION_RATIO, even if it can afford one", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 0, 0, 10);
    const target = createHouse(world, "player", 5, 5, 10); // even population -> no escalation

    const heightmap = flatHeightmap(10, 10, 5);
    createEnemyMiracleSystem({ decisionInterval: 8, heightmap, worldCenter: WORLD_CENTER, rng: () => 0 })(world, 8);

    expect(world.isAlive(target)).toBe(true); // no volcano landed on it
    // Falls through to the (much cheaper) earthquake instead, so mana isn't fully spent.
    expect(world.get(enemy, FactionState)!.mana).toBe(VOLCANO_MANA_COST - EARTHQUAKE_MANA_COST);
  });

  it("targets the opponent's densest house cluster instead of picking uniformly at random", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 19, y: 19 });
    createHouse(world, "player", 5, 5); // clustered pair
    createHouse(world, "player", 6, 5);
    createHouse(world, "player", 15, 15); // isolated, created last

    const heightmap = flatHeightmap(20, 20, 5);
    // A rng biased toward the last index would pick the isolated house under
    // a naive uniformly-random choice — proving the cluster is preferred on
    // its merits, not by coincidence of rng.
    createEnemyMiracleSystem({ decisionInterval: 8, heightmap, worldCenter: WORLD_CENTER, rng: () => 0.99 })(world, 8);

    expect(heightmap.vertices[15][15]).toBe(5); // untouched — well outside the earthquake's radius around the cluster
    const clusterTouched = heightmap.vertices
      .slice(2, 9)
      .some((row) => row.slice(2, 9).some((h) => h !== 5));
    expect(clusterTouched).toBe(true);
  });

  it("does nothing when the opponent has no houses to target and no other action applies", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(EARTHQUAKE_MANA_COST); // nothing to target, nothing spent
    expect(events).toEqual([]);
  });

  /**
   * The player may only cast where their own people are on screen (see
   * main.ts's isOwnFactionVisible). These four are the enemy god playing
   * by the same rule through its own view — see systems/aiViewport.ts.
   */
  it("will not strike a settlement it has nobody near", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 19, y: 19 });
    createHouse(world, "player", 18, 18);

    const heightmap = flatHeightmap(20, 20, 5);
    const events: unknown[] = [];
    // A view 4 tiles each way: the enemy's shrine at (0,0) is nowhere near
    // the player's house, so no placement of it holds both.
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap,
      worldCenter: WORLD_CENTER,
      viewport: { across: 4, along: 4 },
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([]);
    expect(heightmap.vertices.every((row) => row.every((h) => h === 5))).toBe(true);
  });

  it("keeps its mana when there is nothing it can reach", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 19, y: 19 });
    createHouse(world, "player", 18, 18);

    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(20, 20, 5),
      worldCenter: WORLD_CENTER,
      viewport: { across: 4, along: 4 },
    })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(EARTHQUAKE_MANA_COST);
  });

  it("strikes the same settlement once one of its own walkers has marched up to it", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 19, y: 19 });
    createHouse(world, "player", 18, 18);
    const scout = createWalker(world, "enemy");
    world.add(scout, Position, { x: 17, y: 18 });

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(20, 20, 5),
      worldCenter: WORLD_CENTER,
      viewport: { across: 4, along: 4 },
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([{ type: "earthquake", position: { x: 18, y: 18 } }]);
  });

  it("takes the settlement it can reach over a denser one it cannot", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 19, y: 19 });
    createHouse(world, "player", 18, 18); // the denser pair, far away
    createHouse(world, "player", 18, 17);
    createHouse(world, "player", 1, 1); // lone house, right next to the enemy shrine

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(20, 20, 5),
      worldCenter: WORLD_CENTER,
      viewport: { across: 4, along: 4 },
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([{ type: "earthquake", position: { x: 1, y: 1 } }]);
  });

  /**
   * Each world's god draws from one of the original's six schools — see
   * miracleSchools.ts's ENEMY_SIGNATURE_MIRACLE and worlds.ts's
   * WorldDefinition.enemySchool.
   */
  it("casts its own school's miracle rather than the earthquake every god shares", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: 999 });
    createFaction(world, "player", { x: 5, y: 5 });
    createHouse(world, "player", 5, 5);

    const events: unknown[] = [];
    const heightmap = flatHeightmap(20, 20, 5);
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap,
      worldCenter: WORLD_CENTER,
      school: "plant",
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([{ type: "swamp", position: { x: 5, y: 5 } }]);
    expect(world.query(Swamp)).toHaveLength(1);
  });

  it("saves for its own miracle instead of spending the difference on an earthquake", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    // Enough for an earthquake (20), nowhere near a spring (45).
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 5, y: 5 });
    createHouse(world, "player", 5, 5);

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(20, 20, 5),
      worldCenter: WORLD_CENTER,
      school: "water",
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([]);
    expect(world.get(enemy, FactionState)!.mana).toBe(EARTHQUAKE_MANA_COST);
  });

  it("falls back on the earthquake when this world hasn't unlocked its school's own miracle", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: 999 });
    createFaction(world, "player", { x: 5, y: 5 });
    createHouse(world, "player", 5, 5);

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(20, 20, 5),
      worldCenter: WORLD_CENTER,
      school: "fire", // 火の雨 not among the miracles this world allows
      allowedMiracles: ["earthquake"],
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([{ type: "earthquake", position: { x: 5, y: 5 } }]);
  });

  /** 病原菌 on ground with nobody on it is a cast that does nothing. */
  it("keeps its mana when its own miracle would achieve nothing", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: 999 });
    createFaction(world, "player", { x: 5, y: 5 });
    createHouse(world, "player", 5, 5);
    // Already infected, so there is nobody left for a second plague to take.
    for (const entity of world.query(House, Owner)) {
      if (world.get(entity, Owner)!.faction === "player") world.add(entity, Infected, { remaining: 10 });
    }

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(20, 20, 5),
      worldCenter: WORLD_CENTER,
      school: "human",
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([]);
    expect(world.get(enemy, FactionState)!.mana).toBe(999);
  });

  it("falls through to earthquake when a decisive population lead exists but armageddon isn't unlocked yet", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 20);
    createHouse(world, "player", 8, 8, 1);

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      minArmageddonTime: 0,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      allowedMiracles: ["earthquake"],
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(enemy, FactionState)!.finalBattle).toBeFalsy();
    expect(events).toEqual([{ type: "earthquake", position: { x: 8, y: 8 } }]);
  });

  it("does not knight an aggressive leader when knight isn't unlocked", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy");
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: PERSEUS_MANA_COST, leaderId: leader });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      allowedMiracles: ["earthquake"],
    })(world, 8);

    expect(world.get(leader, Walker)!.state).toBe("seeking");
  });

  it("falls through to earthquake once a real population lead exists but volcano isn't unlocked yet", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 3);
    createHouse(world, "player", 8, 8, 1);

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      allowedMiracles: ["earthquake"],
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([{ type: "earthquake", position: { x: 8, y: 8 } }]);
  });

  it("does nothing at all once even earthquake isn't unlocked", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      allowedMiracles: [],
    })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(EARTHQUAKE_MANA_COST); // nothing spent
  });

  it("does not act once finalBattle is already set", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, {
      ...world.get(enemy, FactionState)!,
      mana: ARMAGEDDON_MANA_COST,
      finalBattle: true,
    });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER })(world, 8);

    expect(world.get(enemy, FactionState)!.mana).toBe(ARMAGEDDON_MANA_COST);
  });

  it("does not run again until a full interval has elapsed since the last pass", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 5, 5);

    const system = createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER });
    system(world, 8); // first pass always runs
    expect(world.get(enemy, FactionState)!.mana).toBe(0);

    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: EARTHQUAKE_MANA_COST });
    system(world, 4); // interval not yet elapsed

    expect(world.get(enemy, FactionState)!.mana).toBe(EARTHQUAKE_MANA_COST);
  });
});

describe("createEnemyMiracleSystem personality tuning", () => {
  it("an aggressive personality escalates to volcano with a smaller lead than balanced would require", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 0, 0, 12);
    createHouse(world, "player", 5, 5, 10); // ratio 1.2 -> below VOLCANO_POPULATION_RATIO (1.3), but above aggressive's 1.3*0.85=1.105

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      rng: () => 0,
      personality: "aggressive",
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(events).toEqual([{ type: "volcano", position: { x: 5, y: 5 } }]);
  });

  it("a defensive personality holds off on volcano at a lead balanced would already act on", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 0, 0, 13);
    const target = createHouse(world, "player", 5, 5, 10); // ratio 1.3 -> meets VOLCANO_POPULATION_RATIO, short of defensive's 1.3*1.3=1.69

    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      rng: () => 0,
      personality: "defensive",
    })(world, 8);

    expect(world.isAlive(target)).toBe(true); // no volcano landed on it
    // Falls through to the cheaper earthquake instead.
    expect(world.get(enemy, FactionState)!.mana).toBe(VOLCANO_MANA_COST - EARTHQUAKE_MANA_COST);
  });

  it("an aggressive personality knights its leader where balanced would prefer guardian", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy");
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: PERSEUS_MANA_COST, leaderId: leader });
    createHouse(world, "enemy", 0, 0, 8);
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 9, 9, 10); // ratio (8+1 leader)/10 = 0.9 -> "behind" under balanced (<1), but not under aggressive's <0.7

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      personality: "aggressive",
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(leader, Walker)!.state).toBe("perseus");
    expect(events).toEqual([{ type: "perseus" }]);
  });

  it("a defensive personality guardians its leader where balanced would prefer knight", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");
    const leader = createWalker(world, "enemy");
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: GUARDIAN_MANA_COST, leaderId: leader });
    createHouse(world, "enemy", 0, 0, 10);
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "player", 9, 9, 9); // ratio (10+1 leader)/9 ~= 1.22 -> "ahead" under balanced (>=1), but not under defensive's <1.3

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      personality: "defensive",
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(leader, Walker)!.state).toBe("guardian");
    expect(events).toEqual([{ type: "guardian" }]);
  });

  it("an aggressive personality triggers armageddon with a smaller lead than balanced would require", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: ARMAGEDDON_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 5, 5, 16);
    createHouse(world, "player", 8, 8, 10); // ratio 1.6 -> below ARMAGEDDON_POPULATION_RATIO (1.8), above aggressive's 1.8*0.85=1.53

    const events: unknown[] = [];
    createEnemyMiracleSystem({
      decisionInterval: 8,
      minArmageddonTime: 0,
      heightmap: flatHeightmap(10, 10, 5),
      worldCenter: WORLD_CENTER,
      personality: "aggressive",
      onAction: (event) => events.push(event),
    })(world, 8);

    expect(world.get(enemy, FactionState)!.finalBattle).toBe(true);
    expect(events).toEqual([{ type: "armageddon" }]);
  });

  it("defaults to balanced (today's original, unbiased thresholds) when personality is omitted", () => {
    const world = new World();
    const enemy = createFaction(world, "enemy", { x: 0, y: 0 });
    world.add(enemy, FactionState, { ...world.get(enemy, FactionState)!, mana: VOLCANO_MANA_COST });
    createFaction(world, "player", { x: 9, y: 9 });
    createHouse(world, "enemy", 0, 0, 12);
    const target = createHouse(world, "player", 5, 5, 10); // ratio 1.2 -> below VOLCANO_POPULATION_RATIO

    createEnemyMiracleSystem({ decisionInterval: 8, heightmap: flatHeightmap(10, 10, 5), worldCenter: WORLD_CENTER, rng: () => 0 })(
      world,
      8,
    );

    expect(world.isAlive(target)).toBe(true); // unbiased threshold not met, no volcano
    expect(ARMAGEDDON_POPULATION_RATIO).toBeGreaterThan(VOLCANO_POPULATION_RATIO); // sanity check on the fixtures above
  });
});
