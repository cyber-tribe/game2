import { describe, expect, it } from "vitest";
import { facingFor, impactEffectVisual, swampAffectedTiles, swampVisual, walkCycle, blueFlameTongues } from "./EntityLayer";

describe("facingFor", () => {
  it("picks the iso-screen diagonal matching each tile-axis direction", () => {
    expect(facingFor(1, 0)).toBe("SE"); // +x
    expect(facingFor(-1, 0)).toBe("NW"); // -x
    expect(facingFor(0, 1)).toBe("SW"); // +y
    expect(facingFor(0, -1)).toBe("NE"); // -y
  });

  it("picks the axis with the larger magnitude when heading diagonally", () => {
    expect(facingFor(3, 1)).toBe("SE");
    expect(facingFor(1, 3)).toBe("SW");
    expect(facingFor(-3, -1)).toBe("NW");
    expect(facingFor(-1, -3)).toBe("NE");
  });

  it("falls back to SE for no heading at all", () => {
    expect(facingFor(0, 0)).toBe("SE");
  });
});

describe("walkCycle", () => {
  it("visits every frame of the cycle as time advances", () => {
    const pos = { x: 0, y: 0 };
    const seen = new Set<number>();

    for (let t = 0; t < 5; t += 0.02) seen.add(walkCycle(t, pos));

    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it("stays inside the frame range for any time, including negative", () => {
    for (let t = -5; t < 5; t += 0.05) {
      const frame = walkCycle(t, { x: 2, y: 3 });
      expect(Number.isInteger(frame)).toBe(true);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(4);
    }
  });

  it("offsets the phase by position, so two walkers at different spots aren't synchronized", () => {
    // Asserted over a span rather than at one instant: the cycle is only 4
    // frames now, so any given pair of positions coincides a quarter of the
    // time by chance. What matters is that they don't march in lockstep.
    let differed = 0;
    for (let t = 0; t < 2; t += 0.01) {
      if (walkCycle(t, { x: 0, y: 0 }) !== walkCycle(t, { x: 5, y: 5 })) differed++;
    }

    expect(differed).toBeGreaterThan(0);
  });

  it("gives the same walker the same frame for the same instant (deterministic, not tied to draw order)", () => {
    const pos = { x: 4, y: 7 };
    expect(walkCycle(2.5, pos)).toBe(walkCycle(2.5, pos));
  });
});

describe("swampAffectedTiles", () => {
  it("covers just the four tiles touching the swamp's vertex, for a radius barely past their centers", () => {
    // Distance from a vertex to any of its four surrounding tile centers is
    // sqrt(0.5) ≈ 0.707; 1.2 clears that but not the next ring out (≈1.58).
    const tiles = swampAffectedTiles({ x: 5, y: 5 }, 1.2, 20, 20);

    expect(tiles).toEqual(
      expect.arrayContaining([
        { x: 4, y: 4 },
        { x: 4, y: 5 },
        { x: 5, y: 4 },
        { x: 5, y: 5 },
      ]),
    );
    expect(tiles).toHaveLength(4);
  });

  it("clamps to the map bounds instead of returning negative or out-of-range tiles", () => {
    const tiles = swampAffectedTiles({ x: 0, y: 0 }, 1.2, 20, 20);

    expect(tiles).toEqual([{ x: 0, y: 0 }]);
  });

  it("covers more tiles as the radius grows", () => {
    const small = swampAffectedTiles({ x: 10, y: 10 }, 1.2, 20, 20);
    const large = swampAffectedTiles({ x: 10, y: 10 }, 3, 20, 20);

    expect(large.length).toBeGreaterThan(small.length);
  });
});

describe("impactEffectVisual", () => {
  it("starts fully opaque with no radius at age 0", () => {
    const visual = impactEffectVisual("combatDeath", 0, 1);

    expect(visual.radius).toBe(0);
    expect(visual.alpha).toBe(1);
  });

  it("ends fully transparent with the full radius once age reaches duration", () => {
    const visual = impactEffectVisual("combatDeath", 1, 1);

    expect(visual.alpha).toBe(0);
    expect(visual.radius).toBeGreaterThan(0);
  });

  it("expands and fades monotonically in between", () => {
    const early = impactEffectVisual("drowned", 0.25, 1);
    const late = impactEffectVisual("drowned", 0.75, 1);

    expect(late.radius).toBeGreaterThan(early.radius);
    expect(late.alpha).toBeLessThan(early.alpha);
  });

  it("clamps age beyond the duration instead of overshooting", () => {
    const overshoot = impactEffectVisual("houseBurned", 5, 1);
    const atDuration = impactEffectVisual("houseBurned", 1, 1);

    expect(overshoot).toEqual(atDuration);
  });

  it("picks a distinct color per effect type", () => {
    const colors = new Set(
      (["combatDeath", "houseCaptured", "houseBurned", "drowned"] as const).map(
        (type) => impactEffectVisual(type, 0.5, 1).color,
      ),
    );

    expect(colors.size).toBe(4);
  });
});

describe("swampVisual", () => {
  /**
   * 「面ごとに底なしかどうか設定される」 — the two kinds behave completely
   * differently (one dries up after a few walkers, one takes the ground for
   * the rest of the match) and used to be drawn identically, which made the
   * only question a player asks of a swamp unanswerable by looking.
   */
  it("draws a 底なし沼 differently from an ordinary one", () => {
    const bottomless = swampVisual(true);
    const ordinary = swampVisual(false);

    expect(bottomless.fill).not.toBe(ordinary.fill);
  });

  it("gives a 底なし沼 one wide void where an ordinary swamp gets small scattered ones", () => {
    const bottomless = swampVisual(true);
    const ordinary = swampVisual(false);

    expect(bottomless.holeCount).toBe(1);
    expect(bottomless.centered).toBe(true);
    expect(bottomless.holeRadius).toBeGreaterThan(ordinary.holeRadius);

    expect(ordinary.holeCount).toBeGreaterThan(1);
    expect(ordinary.centered).toBe(false);
  });
});

/**
 * 「リーダーがマグネットに到達すると、その場に停止して青い炎に包まれます」 —
 * see game/protection.ts for when it is drawn at all.
 */
describe("blueFlameTongues", () => {
  it("has a bright middle tongue, taller than the ones beside it", () => {
    const tongues = blueFlameTongues(0);
    const core = tongues.filter((tongue) => tongue.core);

    expect(core).toHaveLength(1);
    for (const tongue of tongues) {
      if (tongue.core) continue;
      expect(tongue.height).toBeLessThan(core[0].height);
    }
  });

  it("stands the tongues either side of the walker's own feet", () => {
    const spreads = blueFlameTongues(0).map((tongue) => tongue.spread);

    expect(Math.min(...spreads)).toBeLessThan(0);
    expect(Math.max(...spreads)).toBeGreaterThan(0);
    expect(spreads.reduce((sum, spread) => sum + spread, 0)).toBeCloseTo(0);
  });

  /** Breathes rather than blinks: always alight, never the same height twice running. */
  it("never goes out, and never holds still", () => {
    const heights = [0, 0.1, 0.2, 0.3].map((t) => blueFlameTongues(t)[0].height);

    for (const height of heights) expect(height).toBeGreaterThan(0);
    expect(new Set(heights).size).toBe(heights.length);
  });
});

