import { describe, expect, it } from "vitest";
import { applyVolcano, isBuildable, isRock, type Heightmap } from "../world/heightmap";
import { House, Owner, Position, Swamp, Walker } from "./components";
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
    const heightmap: Heightmap = { width, height, terrain: "grass", vertices, rockHardness };

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
    const heightmap: Heightmap = { width, height, terrain: "grass", vertices, rockHardness };

    const sim = new Simulation({ worldWidth: width, worldHeight: height, heightmap });

    for (let i = 0; i < 300; i++) {
      sim.update(0.1);
    }

    const houses = sim.world.query(House);
    expect(houses.length).toBeGreaterThan(0);
    expect(houses.some((entity) => sim.world.get(entity, House)!.level !== "hut")).toBe(true);
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
    const heightmap: Heightmap = { width, height, terrain: "grass", vertices, rockHardness };

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
});
