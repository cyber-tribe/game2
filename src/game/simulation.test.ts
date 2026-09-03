import { describe, expect, it } from "vitest";
import { applyFlood, applyVolcano, isBuildable, isRock, type Heightmap } from "../world/heightmap";
import { FactionState, House, Owner, Position, Swamp, Walker } from "./components";
import { MAX_MANA } from "./constants";
import { drownFlood } from "./flood";
import { Simulation } from "./simulation";
import { createSwamp } from "./swamp";
import { eruptVolcano } from "./volcano";

describe("Simulation", () => {
  it("seeds both factions with the requested number of seeking walkers and nothing else", () => {
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20, initialWalkersPerFaction: 4 });

    const summaries = sim.summarize();
    expect(summaries).toHaveLength(2);
    for (const summary of summaries) {
      expect(summary.walkers).toBe(4);
      expect(summary.houses).toBe(0);
      expect(summary.mana).toBe(0);
    }
  });

  it("exposes the same housesCap to every faction, derived from world size", () => {
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20 });

    expect(sim.maxHousesPerFaction).toBeGreaterThan(0);
    for (const summary of sim.summarize()) {
      expect(summary.housesCap).toBe(sim.maxHousesPerFaction);
    }
  });

  it("stops spawning new walkers once a faction's house count reaches its cap", () => {
    const sim = new Simulation({ worldWidth: 4, worldHeight: 4, initialWalkersPerFaction: 0 });
    // TILES_PER_HOUSE_CAP=8 over a 4x4=16 tile world caps at 2 houses per faction.
    expect(sim.maxHousesPerFaction).toBe(2);

    for (const faction of ["player", "enemy"] as const) {
      for (let i = 0; i < sim.maxHousesPerFaction; i++) {
        const house = sim.world.createEntity();
        sim.world.add(house, Position, { x: 1, y: 1 });
        sim.world.add(house, Owner, { faction });
        sim.world.add(house, House, { level: "castle", population: 0 }); // capacity 60, high manaRate
      }
    }

    for (let i = 0; i < 100; i++) sim.update(1); // plenty of time/mana to spawn if the cap didn't hold

    for (const summary of sim.summarize()) {
      expect(summary.houses).toBe(summary.housesCap);
      expect(summary.walkers).toBe(0);
    }
  });

  it("lets walkers wander, settle into houses, and start producing mana over time", () => {
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20 });

    for (let i = 0; i < 200; i++) {
      sim.update(0.1);
    }

    const totalHouses = sim.summarize().reduce((sum, s) => sum + s.houses, 0);
    const totalMana = sim.summarize().reduce((sum, s) => sum + s.mana, 0);

    expect(totalHouses).toBeGreaterThan(0);
    expect(totalMana).toBeGreaterThan(0);
  });

  it("caps mana at MAX_MANA even with a generous mana income sustained for a long time", () => {
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20, initialWalkersPerFaction: 0 });

    for (const faction of ["player", "enemy"] as const) {
      for (let i = 0; i < 5; i++) {
        const house = sim.world.createEntity();
        sim.world.add(house, Position, { x: 5, y: 5 });
        sim.world.add(house, Owner, { faction });
        sim.world.add(house, House, { level: "castle", population: 0 });
      }
    }

    for (let i = 0; i < 300; i++) sim.update(0.1);

    for (const summary of sim.summarize()) {
      expect(summary.mana).toBe(MAX_MANA);
    }
  });

  it("never throws across many ticks, including varying frame deltas", () => {
    const sim = new Simulation({ worldWidth: 16, worldHeight: 16 });

    expect(() => {
      for (let i = 0; i < 500; i++) {
        sim.update(i % 2 === 0 ? 0.016 : 0.25);
      }
    }).not.toThrow();
  });

  it("reports the game as ongoing while both factions have walkers or houses", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10 });
    expect(sim.getOutcome()).toEqual({ over: false });
  });

  it("declares the surviving faction the winner once the other has nothing left", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 1 });

    for (const entity of sim.world.query(Walker, Owner)) {
      if (sim.world.get(entity, Owner)!.faction === "enemy") {
        sim.world.destroyEntity(entity);
      }
    }

    expect(sim.getOutcome()).toEqual({ over: true, winner: "player" });
  });

  it("stops advancing the simulation once the game is over", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 1 });

    for (const entity of sim.world.query(Walker, Owner)) {
      if (sim.world.get(entity, Owner)!.faction === "enemy") {
        sim.world.destroyEntity(entity);
      }
    }

    const before = sim.summarize();
    sim.update(5);
    const after = sim.summarize();

    expect(after).toEqual(before);
  });

  it("keeps every settled house on buildable land when a heightmap with water is provided", () => {
    const width = 20;
    const height = 20;
    const waterFrom = 8;
    const waterTo = 12; // a strip of sea across the middle of the map
    const vertices = Array.from({ length: height + 1 }, () =>
      Array.from({ length: width + 1 }, (_, x) => (x >= waterFrom && x < waterTo ? 0 : 5)),
    );
    const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
    const heightmap: Heightmap = { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };

    const sim = new Simulation({ worldWidth: width, worldHeight: height, heightmap });

    for (let i = 0; i < 300; i++) {
      sim.update(0.1);
    }

    const houses = sim.world.query(House, Position);
    expect(houses.length).toBeGreaterThan(0);
    for (const entity of houses) {
      const pos = sim.world.get(entity, Position)!;
      expect(isBuildable(heightmap, pos.x, pos.y)).toBe(true);
    }
  });

  it("defaults both factions to settle mode and lets behaviorMode be switched freely", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10 });

    expect(sim.getBehaviorMode("player")).toBe("settle");
    expect(sim.getBehaviorMode("enemy")).toBe("settle");

    sim.setBehaviorMode("player", "fight");

    expect(sim.getBehaviorMode("player")).toBe("fight");
    expect(sim.getBehaviorMode("enemy")).toBe("settle");
  });

  it("upgrades houses beyond hut when the whole map is perfectly flat", () => {
    const width = 20;
    const height = 20;
    const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(5));
    const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
    const heightmap: Heightmap = { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };

    const sim = new Simulation({ worldWidth: width, worldHeight: height, heightmap });

    for (let i = 0; i < 300; i++) {
      sim.update(0.1);
    }

    const houses = sim.world.query(House);
    expect(houses.length).toBeGreaterThan(0);
    expect(houses.some((entity) => sim.world.get(entity, House)!.level !== "hut")).toBe(true);
  });

  it("grows population slower on harsher terrain (rock) than on grass, all else equal", () => {
    const width = 10;
    const height = 10;
    const flatHeightmap = (terrain: Heightmap["terrain"]): Heightmap => ({
      width,
      height,
      terrain,
      vertices: Array.from({ length: height + 1 }, () => Array(width + 1).fill(5)),
      rockHardness: Array.from({ length: height + 1 }, () => Array(width + 1).fill(0)),
      waterLevel: 0,
    });

    const grassSim = new Simulation({ worldWidth: width, worldHeight: height, heightmap: flatHeightmap("grass") });
    const rockSim = new Simulation({ worldWidth: width, worldHeight: height, heightmap: flatHeightmap("rock") });

    // One hand-placed hut per faction per sim, bypassing wander/settle
    // randomness so the only variable left is the terrain-driven growth
    // rate. Both factions need a house — leaving either at 0 houses/0
    // walkers would end the game immediately via getOutcome().
    for (const sim of [grassSim, rockSim]) {
      for (const entity of sim.world.query(Walker)) sim.world.destroyEntity(entity);

      for (const faction of ["player", "enemy"] as const) {
        const house = sim.world.createEntity();
        sim.world.add(house, Position, { x: 5, y: 5 });
        sim.world.add(house, Owner, { faction });
        sim.world.add(house, House, { level: "hut", population: 0 });
      }
    }

    for (let i = 0; i < 30; i++) {
      grassSim.update(0.1);
      rockSim.update(0.1);
    }

    const totalPopulation = (sim: Simulation) =>
      sim.world.query(House).reduce((sum, entity) => sum + sim.world.get(entity, House)!.population, 0);

    expect(totalPopulation(grassSim)).toBeGreaterThan(totalPopulation(rockSim));
  });

  it("drowns walkers that wander into a conjured swamp during a normal tick", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 2 });

    const [walker] = sim.world.query(Walker, Owner, Position);
    const pos = sim.world.get(walker, Position)!;
    createSwamp(sim.world, pos.x, pos.y, 100, 10); // huge radius: guaranteed to catch every walker

    sim.update(0.1);

    expect(sim.world.query(Walker)).toHaveLength(0);
    expect(sim.world.query(Swamp)).toHaveLength(1);
  });

  it("erupting a volcano destroys a house standing there and marks the land unbuildable", () => {
    const width = 20;
    const height = 20;
    const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(5));
    const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
    const heightmap: Heightmap = { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };

    const sim = new Simulation({ worldWidth: width, worldHeight: height, heightmap });

    for (let i = 0; i < 200; i++) sim.update(0.1); // let some houses settle
    const [house] = sim.world.query(House, Position);
    const pos = sim.world.get(house, Position)!;

    eruptVolcano(sim.world, pos.x, pos.y, 1);
    expect(sim.world.isAlive(house)).toBe(false);

    applyVolcano(heightmap, pos.x, pos.y, 1);
    expect(isBuildable(heightmap, pos.x, pos.y)).toBe(false);
    expect(isRock(heightmap, pos.x, pos.y)).toBe(true);
  });

  it("assigns a leader to each faction on the first tick", () => {
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20 });
    sim.update(0.001);

    const leaderIds = sim.world.query(FactionState).map((entity) => sim.world.get(entity, FactionState)!.leaderId);
    expect(leaderIds).toHaveLength(2);
    expect(leaderIds.every((id) => id !== undefined)).toBe(true);
  });

  it("under goToShrine mode, walks a lone leader to a relocated shrine and settles it there", () => {
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20, initialWalkersPerFaction: 1 });
    sim.setBehaviorMode("player", "goToShrine");
    const shrine = { x: 5, y: 5 };
    sim.moveShrine("player", shrine);

    // Starting distance is 10 tiles at DEFAULT_WALKER_SPEED=1.5 tiles/s: ~6.7s to arrive.
    // Stay well under the ~5s-after-arrival mark where the settled hut would
    // finish accumulating enough population to spawn (and instantly settle)
    // a second walker at the same spot.
    for (let i = 0; i < 100; i++) sim.update(0.1);

    const playerHouses = sim.world.query(House, Owner, Position).filter((entity) => sim.world.get(entity, Owner)!.faction === "player");
    expect(playerHouses).toHaveLength(1);
    expect(sim.world.get(playerHouses[0], Position)).toEqual(shrine);
  });

  it("a knighted leader hunts down the enemy regardless of behaviorMode, and survives the kill", () => {
    const sim = new Simulation({ worldWidth: 4, worldHeight: 4, initialWalkersPerFaction: 1 });
    sim.update(0.001); // let leaderSystem assign a leader to each faction first
    sim.knightify("player");

    const [playerWalker] = sim.world.query(Walker, Owner).filter((e) => sim.world.get(e, Owner)!.faction === "player");
    expect(sim.world.get(playerWalker, Walker)!.state).toBe("knight");
    // Overwhelming strength removes any doubt about walker-vs-walker combat
    // (an exact tie would destroy both sides) — this test is about the
    // knight's unconditional targeting/burning/swamp-immunity wiring, not
    // combat math, which walkerCombatSystem/houseCaptureSystem already
    // cover on their own.
    sim.world.add(playerWalker, Walker, { ...sim.world.get(playerWalker, Walker)!, strength: 999 });

    for (let i = 0; i < 150; i++) sim.update(0.1);

    const enemyWalkers = sim.world.query(Walker, Owner).filter((e) => sim.world.get(e, Owner)!.faction === "enemy");
    const enemyHouses = sim.world.query(House, Owner).filter((e) => sim.world.get(e, Owner)!.faction === "enemy");
    expect(enemyWalkers).toHaveLength(0);
    expect(enemyHouses).toHaveLength(0); // burned, not captured

    const playerWalkers = sim.world.query(Walker, Owner).filter((e) => sim.world.get(e, Owner)!.faction === "player");
    expect(playerWalkers).toHaveLength(1);
    expect(sim.world.get(playerWalkers[0], Walker)!.state).toBe("knight");
  });

  it("armageddon abandons every house, sends both factions to the center, and forces the game to a conclusion", () => {
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20, initialWalkersPerFaction: 1 });

    for (let i = 0; i < 150; i++) sim.update(0.1); // let each faction's lone walker settle into a house
    expect(sim.world.query(House).length).toBeGreaterThan(0);

    sim.triggerArmageddon();

    expect(sim.world.query(House)).toHaveLength(0); // every house abandoned
    expect(sim.getBehaviorMode("player")).toBe("goToShrine");
    expect(sim.getBehaviorMode("enemy")).toBe("goToShrine");

    // Houses that had spread far from the center before armageddon convert
    // into walkers that need time to march back in, so this budget is
    // generous (mirrors the ~30s it took empirically in a worst-case trace).
    for (let i = 0; i < 400; i++) sim.update(0.1);

    expect(sim.getOutcome().over).toBe(true);
  });

  it("a flood submerges settled houses across the whole map, for both factions", () => {
    const width = 20;
    const height = 20;
    const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(1)); // uniformly low land
    const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
    const heightmap: Heightmap = { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };

    const sim = new Simulation({ worldWidth: width, worldHeight: height, heightmap });

    for (let i = 0; i < 200; i++) sim.update(0.1); // let houses settle for both factions
    expect(sim.world.query(House).length).toBeGreaterThan(0);

    applyFlood(heightmap, 1); // water level now matches the land height everywhere
    drownFlood(sim.world, heightmap);

    expect(sim.world.query(House)).toHaveLength(0);
  });
});
