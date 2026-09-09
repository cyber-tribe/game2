import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, Owner, Position, Walker, type FactionId } from "../components";
import { createFaction } from "../faction";
import { promoteHero } from "../hero";
import { createLeaderLossSystem } from "./leaderLoss";

function walker(world: World, faction: FactionId, x = 0, y = 0) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 5, state: "seeking", speed: 1 });
  return entity;
}

function withLeader(world: World, faction: FactionId) {
  const factionEntity = createFaction(world, faction, { x: 0, y: 0 });
  const leader = walker(world, faction);
  world.add(factionEntity, FactionState, { ...world.get(factionEntity, FactionState)!, leaderId: leader });
  return { factionEntity, leader };
}

describe("createLeaderLossSystem", () => {
  it("says nothing while the leader is alive", () => {
    const world = new World();
    withLeader(world, "player");
    const lost: FactionId[] = [];
    const system = createLeaderLossSystem({ onLeaderLost: (faction) => lost.push(faction) });

    system(world, 1);
    system(world, 1);

    expect(lost).toEqual([]);
  });

  it("reports the faction whose leader died", () => {
    const world = new World();
    const { leader } = withLeader(world, "enemy");
    const lost: FactionId[] = [];
    const system = createLeaderLossSystem({ onLeaderLost: (faction) => lost.push(faction) });

    system(world, 1);
    world.destroyEntity(leader);
    system(world, 1);

    expect(lost).toEqual(["enemy"]);
  });

  it("reports it once, not on every tick afterwards", () => {
    const world = new World();
    const { leader } = withLeader(world, "player");
    const lost: FactionId[] = [];
    const system = createLeaderLossSystem({ onLeaderLost: (faction) => lost.push(faction) });

    system(world, 1);
    world.destroyEntity(leader);
    system(world, 1);
    system(world, 1);

    expect(lost).toEqual(["player"]);
  });

  /** promoteHero clears leaderId and the walker walks on — nobody died. */
  it("does not call a promotion a death", () => {
    const world = new World();
    const { leader } = withLeader(world, "player");
    const lost: FactionId[] = [];
    const system = createLeaderLossSystem({ onLeaderLost: (faction) => lost.push(faction) });

    system(world, 1);
    promoteHero(world, "player", "perseus");
    system(world, 1);

    expect(world.isAlive(leader)).toBe(true);
    expect(lost).toEqual([]);
  });

  it("reports each side separately", () => {
    const world = new World();
    const mine = withLeader(world, "player");
    const theirs = withLeader(world, "enemy");
    const lost: FactionId[] = [];
    const system = createLeaderLossSystem({ onLeaderLost: (faction) => lost.push(faction) });

    system(world, 1);
    world.destroyEntity(theirs.leader);
    system(world, 1);
    world.destroyEntity(mine.leader);
    system(world, 1);

    expect(lost).toEqual(["enemy", "player"]);
  });

  it("says nothing about a faction that never had a leader", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    const lost: FactionId[] = [];

    createLeaderLossSystem({ onLeaderLost: (faction) => lost.push(faction) })(world, 1);

    expect(lost).toEqual([]);
  });
});
