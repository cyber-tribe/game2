import { describe, expect, it } from "vitest";
import { columnDepthOrder, seatingBorder, wedgeIsPlayers } from "./PopulationGauge";

describe("seatingBorder", () => {
  it("puts the border exactly at the middle for a dead-level match", () => {
    expect(seatingBorder(0.5)).toBe(0.5);
  });

  it("hands the whole bowl to one side at the extremes", () => {
    expect(seatingBorder(0)).toBe(0);
    expect(seatingBorder(1)).toBe(1);
  });

  it("clamps a share outside [0, 1] rather than running off the bowl", () => {
    expect(seatingBorder(-0.3)).toBe(0);
    expect(seatingBorder(1.4)).toBe(1);
  });
});

describe("wedgeIsPlayers", () => {
  /**
   * The player fills from the left, as the two-colour bar this replaced
   * did. Getting this backwards is invisible in code and glaring on screen.
   */
  it("gives the player the left of the bowl and the enemy the right", () => {
    const border = seatingBorder(0.5);

    expect(wedgeIsPlayers(0.1, border)).toBe(true);
    expect(wedgeIsPlayers(0.9, border)).toBe(false);
  });

  it("moves the border with the share", () => {
    // Three quarters ahead: a wedge at 0.7 across is now the player's.
    expect(wedgeIsPlayers(0.7, seatingBorder(0.75))).toBe(true);
    expect(wedgeIsPlayers(0.7, seatingBorder(0.25))).toBe(false);
  });

  it("leaves no wedge unclaimed — every position belongs to one side", () => {
    for (const share of [0, 0.25, 0.5, 0.75, 1]) {
      const border = seatingBorder(share);
      for (let x = 0; x <= 1.0001; x += 0.05) {
        expect(typeof wedgeIsPlayers(x, border)).toBe("boolean");
      }
    }
  });
});

describe("columnDepthOrder", () => {
  /**
   * The overlap between columns is the cheapest cue that the structure has
   * depth. Painted in index order instead, the same columns read as a bar
   * chart — which is the whole thing this drawing exists not to be.
   */
  it("paints the back of the colonnade first and the near ends last", () => {
    const order = columnDepthOrder(16);

    // The middle boundary is at the very back of the bowl.
    expect(order[0]).toBe(8);
    // The two ends are nearest the viewer, so they go on top.
    expect(order.slice(-2).sort((a, b) => a - b)).toEqual([0, 16]);
  });

  it("returns every column exactly once", () => {
    const order = columnDepthOrder(16);

    expect(order).toHaveLength(17); // one at each end of every wedge
    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });

  it("never puts a nearer column behind a farther one", () => {
    const order = columnDepthOrder(16);
    const depth = (i: number) => Math.sin(Math.PI * (1 - i / 16));

    for (let i = 1; i < order.length; i++) {
      expect(depth(order[i])).toBeLessThanOrEqual(depth(order[i - 1]) + 1e-9);
    }
  });
});
