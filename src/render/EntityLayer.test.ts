import { describe, expect, it } from "vitest";
import { walkCycle } from "./EntityLayer";

describe("walkCycle", () => {
  it("alternates between stepping frames as time advances", () => {
    const pos = { x: 0, y: 0 };
    const seenStepping = new Set<boolean>();

    for (let t = 0; t < 5; t += 0.05) {
      seenStepping.add(walkCycle(t, pos).stepping);
    }

    expect(seenStepping).toEqual(new Set([true, false]));
  });

  it("bobs between 0 and the amplitude, never negative or overshooting", () => {
    const pos = { x: 2, y: 3 };

    for (let t = 0; t < 5; t += 0.05) {
      const { bob } = walkCycle(t, pos);
      expect(bob).toBeGreaterThanOrEqual(0);
      expect(bob).toBeLessThanOrEqual(1);
    }
  });

  it("offsets the phase by position, so two walkers at different spots aren't synchronized", () => {
    const t = 1.23;
    const a = walkCycle(t, { x: 0, y: 0 });
    const b = walkCycle(t, { x: 5, y: 5 });

    // Same instant, different positions -> not guaranteed to match (this
    // pair in particular doesn't), proving the phase actually depends on
    // position and not just on elapsedTime.
    expect(a).not.toEqual(b);
  });

  it("gives the same walker the same result for the same instant (deterministic, not tied to draw order)", () => {
    const pos = { x: 4, y: 7 };
    expect(walkCycle(2.5, pos)).toEqual(walkCycle(2.5, pos));
  });
});
