import { describe, expect, it } from "vitest";
import { ALL_MIRACLES, WORLDS, nextWorldId, unlockedCountForPassword } from "./worlds";

describe("WORLDS", () => {
  it("has at least one selectable world", () => {
    expect(WORLDS.length).toBeGreaterThan(0);
  });

  it("gives every world a unique id", () => {
    const ids = WORLDS.map((world) => world.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every world the same fixed 64x64 map size (see plan/0062-original-scale-map.md)", () => {
    for (const world of WORLDS) {
      expect(world.worldWidth).toBe(64);
      expect(world.worldHeight).toBe(64);
    }
  });

  it("never eases the enemy AI's speed or aggression as the list goes on", () => {
    for (let i = 1; i < WORLDS.length; i++) {
      expect(WORLDS[i].enemyDecisionInterval).toBeLessThanOrEqual(WORLDS[i - 1].enemyDecisionInterval);
      expect(WORLDS[i].enemyAggressionThreshold).toBeLessThanOrEqual(WORLDS[i - 1].enemyAggressionThreshold);
    }
  });

  it("keeps enemyDecisionInterval and enemyAggressionThreshold positive", () => {
    for (const world of WORLDS) {
      expect(world.enemyDecisionInterval).toBeGreaterThan(0);
      expect(world.enemyAggressionThreshold).toBeGreaterThan(0);
    }
  });

  it("never drops a miracle a previous world already unlocked (allowedMiracles only grows)", () => {
    for (let i = 1; i < WORLDS.length; i++) {
      for (const miracle of WORLDS[i - 1].allowedMiracles) {
        expect(WORLDS[i].allowedMiracles).toContain(miracle);
      }
    }
  });

  it("unlocks strictly more miracles at some point across the list, not the same set throughout", () => {
    const counts = WORLDS.map((world) => world.allowedMiracles.length);
    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts));
  });

  it("unlocks every miracle by the final world", () => {
    const lastWorld = WORLDS[WORLDS.length - 1];
    for (const miracle of ALL_MIRACLES) {
      expect(lastWorld.allowedMiracles).toContain(miracle);
    }
  });

  it("never lists a miracle outside the known set", () => {
    for (const world of WORLDS) {
      for (const miracle of world.allowedMiracles) {
        expect(ALL_MIRACLES).toContain(miracle);
      }
    }
  });
});

describe("nextWorldId", () => {
  it("returns the following world's id for a world in the middle of the list", () => {
    expect(nextWorldId(WORLDS[0].id)).toBe(WORLDS[1].id);
  });

  it("returns undefined once the last world in the list is cleared", () => {
    expect(nextWorldId(WORLDS[WORLDS.length - 1].id)).toBeUndefined();
  });

  it("returns undefined for an id that isn't in WORLDS at all", () => {
    expect(nextWorldId("not-a-real-world")).toBeUndefined();
  });
});

describe("unlockedCountForPassword", () => {
  it("unlocks through the matched world, one past its own index", () => {
    expect(unlockedCountForPassword(WORLDS[2].id)).toBe(3);
  });

  it("unlocking with the very first world's id still only unlocks that one world", () => {
    expect(unlockedCountForPassword(WORLDS[0].id)).toBe(1);
  });

  it("unlocking with the password nextWorldId hands out also covers the world just cleared", () => {
    const clearedIndex = 1;
    const password = nextWorldId(WORLDS[clearedIndex].id)!;

    expect(unlockedCountForPassword(password)).toBe(clearedIndex + 2);
  });

  it("returns undefined for an unrecognized password", () => {
    expect(unlockedCountForPassword("not-a-real-password")).toBeUndefined();
  });
});
