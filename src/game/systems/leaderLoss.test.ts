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

  /**
   * 「敵リーダーが焼死すると、マグネットがその場に残る」——攻略が No.1 で
   * 戦法として書いている動きそのもの。倒した場所へ相手の集結地が動くから、
   * 次に寄ってくる者を待ち伏せできる。
   */
  it("leaves the magnet where the leader fell", () => {
    const world = new World();
    const { factionEntity } = withLeader(world, "player");
    const leader = world.get(factionEntity, FactionState)!.leaderId!;
    world.add(leader, Position, { x: 31, y: 17 }); // 集結地（0,0）から遠い戦場
    const system = createLeaderLossSystem();

    system(world, 1);
    world.destroyEntity(leader);
    system(world, 1);

    expect(world.get(factionEntity, FactionState)!.shrinePosition).toEqual({ x: 31, y: 17 });
  });

  it("moves only that faction's magnet", () => {
    const world = new World();
    const mine = withLeader(world, "player");
    const theirs = withLeader(world, "enemy");
    world.add(theirs.leader, Position, { x: 40, y: 40 });
    const system = createLeaderLossSystem();

    system(world, 1);
    world.destroyEntity(theirs.leader);
    system(world, 1);

    expect(world.get(theirs.factionEntity, FactionState)!.shrinePosition).toEqual({ x: 40, y: 40 });
    expect(world.get(mine.factionEntity, FactionState)!.shrinePosition).toEqual({ x: 0, y: 0 });
  });

  /**
   * **変身は死ではない。** ヒーロー化でも「マグネットはリーダーのいた場所へ
   * 移動する」が、それを行うのは hero.ts（`plan/archived/0146`）である。
   * ここが二重に動かすと、変身したヒーローが歩いたぶんだけ集結地がずれる。
   */
  it("does not move the magnet when the leader was promoted rather than killed", () => {
    const world = new World();
    const { factionEntity, leader } = withLeader(world, "player");
    world.add(leader, Position, { x: 12, y: 8 });
    const system = createLeaderLossSystem();

    system(world, 1); // このtickで (12,8) が控えに入る
    world.add(leader, Position, { x: 25, y: 25 });
    promoteHero(world, "player", "perseus"); // hero.ts がここで (25,25) を書く
    system(world, 1);

    // 控えの (12,8) ではなく、変身した場所が残っていること——2つの位置を
    // 分けておかないと、二重に動かしても気付けない。
    expect(world.get(factionEntity, FactionState)!.shrinePosition).toEqual({ x: 25, y: 25 });
  });
});
