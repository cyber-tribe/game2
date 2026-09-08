import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { FactionState, Owner, Position, Walker, type BehaviorMode } from "./components";
import { GATHER_RANGE } from "./constants";
import { createFaction } from "./faction";
import { isShieldedAtMagnet, resistsMiracle } from "./protection";

function stage(options: { mode?: BehaviorMode; at?: { x: number; y: number }; state?: Walker["state"] } = {}) {
  const world = new World();
  const faction = createFaction(world, "player", { x: 10, y: 10 }, options.mode ?? "gather");
  const leader = world.createEntity();
  world.add(leader, Position, options.at ?? { x: 10, y: 10 });
  world.add(leader, Owner, { faction: "player" });
  world.add(leader, Walker, { strength: 1, state: options.state ?? "seeking", speed: 1 });
  world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });
  return { world, leader };
}

/**
 * 「リーダーがマグネットに到達すると、その場に停止して青い炎に包まれます
 * (この間は無敵状態になります)」.
 */
describe("isShieldedAtMagnet", () => {
  it("shields a leader standing on its own magnet under 集合", () => {
    const { world, leader } = stage();

    expect(isShieldedAtMagnet(world, leader)).toBe(true);
  });

  it("drops the moment the order is lifted — 「その瞬間にリーダーも地割れに落ちる」", () => {
    const { world, leader } = stage({ mode: "fight" });

    expect(isShieldedAtMagnet(world, leader)).toBe(false);
  });

  it("does not reach a leader still on its way to the flag", () => {
    const { world, leader } = stage({ at: { x: 10 + GATHER_RANGE + 1, y: 10 } });

    expect(isShieldedAtMagnet(world, leader)).toBe(false);
  });

  it("is the leader's alone — an ordinary walker standing there gets nothing", () => {
    const { world } = stage();
    const bystander = world.createEntity();
    world.add(bystander, Position, { x: 10, y: 10 });
    world.add(bystander, Owner, { faction: "player" });
    world.add(bystander, Walker, { strength: 1, state: "seeking", speed: 1 });

    expect(isShieldedAtMagnet(world, bystander)).toBe(false);
  });

  /**
   * The flame is what the leader does on *arriving* at the flag and
   * stopping there; under 集結シンボルへ it is leading a march instead.
   */
  it("does not shield under 集結シンボルへ", () => {
    const { world, leader } = stage({ mode: "goToShrine" });

    expect(isShieldedAtMagnet(world, leader)).toBe(false);
  });
});

describe("resistsMiracle", () => {
  it("shields the waiting leader from every school at once", () => {
    const { world, leader } = stage();

    for (const school of ["human", "plant", "earth", "air", "fire", "water"] as const) {
      expect({ school, resists: resistsMiracle(world, leader, school) }).toEqual({ school, resists: true });
    }
  });

  it("still lets a hero's own school through to it once the order is lifted", () => {
    const { world, leader } = stage({ mode: "settle", state: "hercules" });

    expect(resistsMiracle(world, leader, "earth")).toBe(true); // its own school
    expect(resistsMiracle(world, leader, "fire")).toBe(false); // anyone else's
  });

  it("protects an ordinary walker from nothing", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 0, y: 0 });
    world.add(walker, Walker, { strength: 1, state: "seeking", speed: 1 });

    expect(resistsMiracle(world, walker, "fire")).toBe(false);
  });
});
