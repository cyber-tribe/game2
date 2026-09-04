import { describe, expect, it } from "vitest";
import { WORLDS, nextWorldId, unlockedCountForPassword } from "./worlds";

describe("WORLDS", () => {
  it("has at least one selectable world", () => {
    expect(WORLDS.length).toBeGreaterThan(0);
  });

  it("gives every world a unique id", () => {
    const ids = WORLDS.map((world) => world.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every world's map size at or under the measured-safe 32x32 ceiling (see plan/0055-map-expansion.md)", () => {
    for (const world of WORLDS) {
      expect(world.worldWidth).toBeLessThanOrEqual(32);
      expect(world.worldHeight).toBeLessThanOrEqual(32);
      expect(world.worldWidth).toBeGreaterThan(0);
      expect(world.worldHeight).toBeGreaterThan(0);
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
