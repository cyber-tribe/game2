import { describe, expect, it } from "vitest";
import { WORLDS } from "./worlds";

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
