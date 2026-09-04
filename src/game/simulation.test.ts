import { describe, expect, it } from "vitest";
import { applyFlood, applyVolcano, isBuildable, isRock, type Heightmap } from "../world/heightmap";
import { FactionState, House, Owner, Position, Swamp, Walker } from "./components";
import { ARMAGEDDON_MANA_COST, HOUSE_LEVELS, MAX_MANA } from "./constants";
import { drownFlood } from "./flood";
import { Simulation } from "./simulation";
import { createSwamp } from "./swamp";
import { eruptVolcano } from "./volcano";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };
}

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

  it("records a player-cast miracle timestamped against how long the match has run", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 1 });

    sim.update(3);
    sim.recordEvent("player", "earthquake");
    sim.update(2);
    sim.recordEvent("player", "volcano");

    expect(sim.getMatchEvents()).toEqual([
      { time: 3, faction: "player", type: "earthquake" },
      { time: 5, faction: "player", type: "volcano" },
    ]);
  });

  it("stops advancing match time (and so stops timestamping new events meaningfully) once the game is over", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 1 });

    for (const entity of sim.world.query(Walker, Owner)) {
      if (sim.world.get(entity, Owner)!.faction === "enemy") {
        sim.world.destroyEntity(entity);
      }
    }

    sim.update(3); // no-ops once over, per the test above
    sim.update(10);
    sim.recordEvent("player", "earthquake");

    expect(sim.getMatchEvents()).toEqual([{ time: 0, faction: "player", type: "earthquake" }]);
  });

  it("automatically records a miracle the enemy AI casts on its own, not just the player's own casts", () => {
    // Perfectly flat: createEnemyTerraformSystem also runs this same first
    // tick and would otherwise spend a bit of the enemy's mana flattening
    // around its house, leaving it just short of affording the miracle below
    // (MAX_MANA equals ARMAGEDDON_MANA_COST exactly, so there's no "spare"
    // mana to buffer against that with).
    const heightmap = flatHeightmap(10, 10, 5);
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 0, heightmap });
    const enemyEntity = [...sim.world.query(FactionState)].find(
      (e) => sim.world.get(e, FactionState)!.id === "enemy",
    )!;
    sim.world.add(enemyEntity, FactionState, { ...sim.world.get(enemyEntity, FactionState)!, mana: ARMAGEDDON_MANA_COST });

    const enemyHouse = sim.world.createEntity();
    sim.world.add(enemyHouse, Position, { x: 1, y: 1 });
    sim.world.add(enemyHouse, Owner, { faction: "enemy" });
    // Kept under HOUSE_LEVELS.hut.capacity so a tick's population growth
    // (or a possible flatness-driven level-up) can't spill this over into
    // spawning a new walker and muddying the population lead being tested.
    sim.world.add(enemyHouse, House, { level: "hut", population: 8 });

    const playerHouse = sim.world.createEntity();
    // Corner-adjacent (both axes near an edge, like the enemy's house
    // above): countFlatNeighbors can't see past the map edge on either
    // side here, so this stays below castle's flatness requirement and
    // won't fire an unrelated houseReachedCastle event on this same first
    // tick (a house away from every edge, on this perfectly flat map,
    // would reach castle immediately).
    sim.world.add(playerHouse, Position, { x: 9, y: 9 });
    sim.world.add(playerHouse, Owner, { faction: "player" });
    sim.world.add(playerHouse, House, { level: "hut", population: 1 });

    sim.update(0.1); // every decision system runs on its very first tick

    // Not "armageddon": enemyMiracles.ts won't trigger 最終決戦 before
    // MIN_ARMAGEDDON_TIME has elapsed, however lopsided the population
    // ratio already is — see plan/0045-armageddon-timing.md. With the
    // ratio this decisive (20 vs 1) but the match only 0.1s old, the AI
    // falls through to the next-priciest thing it can afford instead.
    expect(sim.getMatchEvents()).toEqual([{ time: 0.1, faction: "enemy", type: "volcano" }]);
  });

  it("records houseCaptured when a walker takes an enemy house in combat", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 0 });
    const enemyHouse = sim.world.createEntity();
    sim.world.add(enemyHouse, Position, { x: 5, y: 5 });
    sim.world.add(enemyHouse, Owner, { faction: "enemy" });
    sim.world.add(enemyHouse, House, { level: "hut", population: 0 });

    const attacker = sim.world.createEntity();
    sim.world.add(attacker, Position, { x: 5, y: 5 });
    sim.world.add(attacker, Owner, { faction: "player" });
    sim.world.add(attacker, Walker, { strength: HOUSE_LEVELS.hut.defense + 1, state: "seeking", speed: 1 });

    sim.update(0.1);

    expect(sim.getMatchEvents()).toContainEqual({ time: 0.1, faction: "player", type: "houseCaptured" });
  });

  it("records houseBurned when a knight burns an enemy house down", () => {
    const sim = new Simulation({ worldWidth: 10, worldHeight: 10, initialWalkersPerFaction: 0 });
    const enemyHouse = sim.world.createEntity();
    sim.world.add(enemyHouse, Position, { x: 5, y: 5 });
    sim.world.add(enemyHouse, Owner, { faction: "enemy" });
    sim.world.add(enemyHouse, House, { level: "hut", population: 0 });

    const knight = sim.world.createEntity();
    sim.world.add(knight, Position, { x: 5, y: 5 });
    sim.world.add(knight, Owner, { faction: "player" });
    sim.world.add(knight, Walker, { strength: 1, state: "knight", speed: 1 });

    sim.update(0.1);

    expect(sim.getMatchEvents()).toContainEqual({ time: 0.1, faction: "player", type: "houseBurned" });
  });

  it("records houseReachedCastle when a house's surroundings become flat enough", () => {
    const heightmap = flatHeightmap(20, 20, 5); // fully flat, comfortably away from any edge
    // initialWalkersPerFaction defaults to giving both sides walkers, so
    // the enemy isn't already "defeated" (0 walkers, 0 houses) the instant
    // update() checks the outcome — which would skip the whole tick,
    // including houseUpgradeSystem, before it ever ran.
    const sim = new Simulation({ worldWidth: 20, worldHeight: 20, heightmap });
    const house = sim.world.createEntity();
    sim.world.add(house, Position, { x: 10, y: 10 });
    sim.world.add(house, Owner, { faction: "player" });
    sim.world.add(house, House, { level: "hut", population: 0 });

    sim.update(0.1);

    expect(sim.getMatchEvents()).toContainEqual({ time: 0.1, faction: "player", type: "houseReachedCastle" });
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

    // Generous budget: knightTargetingSystem/fightTargetingSystem lock onto
    // a snapshot of the enemy's position rather than tracking it live, so if
    // the enemy walker is still wandering when the knight locks on, the
    // knight can arrive at an already-stale, empty spot and only then
    // retarget to the walker's real (by now possibly settled) location —
    // occasionally adding a second full leg of travel plus
    // KNIGHT_BURN_COOLDOWN on top. 150 ticks (15s) was tight enough to be
    // flaky in that case; 600 (60s) comfortably covers it.
    for (let i = 0; i < 600; i++) sim.update(0.1);

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

    // The enemy's own earthquake sabotage (see enemyMiracles.ts) can have
    // heaved a few vertices above 1 by now — re-flatten before flooding so
    // this test only exercises "flood submerges land at/below the new
    // water level", not incidental high ground from unrelated AI behavior.
    for (const row of heightmap.vertices) row.fill(1);

    applyFlood(heightmap, 1); // water level now matches the land height everywhere
    drownFlood(sim.world, heightmap);

    expect(sim.world.query(House)).toHaveLength(0);
  });
});
