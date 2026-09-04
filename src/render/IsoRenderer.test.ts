import { Graphics } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";
import { IsoRenderer, TILE_HEIGHT, TILE_WIDTH, visibleTileBounds, volcanoGlowIntensity, type TileBounds } from "./IsoRenderer";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };
}

describe("IsoRenderer.update", () => {
  it("eases the displayed terrain height toward the real height gradually instead of snapping", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    // @ts-expect-error -- displayVertices is a private implementation detail; reached into here
    // specifically to verify the easing behavior redraw() alone can't expose without a canvas.
    const display = () => renderer.displayVertices[2][2] as number;

    expect(display()).toBe(5);
    heightmap.vertices[2][2] = 6;

    const steps: number[] = [];
    for (let i = 0; i < 10; i++) {
      renderer.update(1 / 60);
      steps.push(display());
    }

    expect(steps.every((v, i) => i === 0 || v >= steps[i - 1])).toBe(true);
    expect(steps.every((v) => v <= 6)).toBe(true);
    expect(steps[0]).toBeLessThan(5.9);
    expect(Math.abs(steps[steps.length - 1] - 6)).toBeLessThan(0.05);
  });
});

describe("IsoRenderer.isAnimating", () => {
  const WHOLE_4X4: TileBounds = { minX: 0, maxX: 3, minY: 0, maxY: 3 };

  it("is false for a flat, unedited, lava-free map", () => {
    const renderer = new IsoRenderer(flatHeightmap(4, 4, 5));
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(false);
  });

  it("turns true while an edit is still easing in, and false again once it settles", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    heightmap.vertices[2][2] = 6;

    expect(renderer.isAnimating(WHOLE_4X4)).toBe(true);
    for (let i = 0; i < 30; i++) renderer.update(1 / 60);
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(false);
  });

  it("ignores an in-progress ease outside the given bounds", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    heightmap.vertices[3][3] = 6; // touches only tile (2,2) and (3,3), not the (0,0) corner below

    expect(renderer.isAnimating({ minX: 0, maxX: 0, minY: 0, maxY: 0 })).toBe(false);
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(true);
  });

  it("turns true once redraw() finds glowing lava within its bounds, and false again once it's fully cooled", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    heightmap.rockHardness[1][1] = VOLCANO_ROCK_HARDNESS;
    const renderer = new IsoRenderer(heightmap); // constructor already calls redraw() over the whole map

    expect(renderer.isAnimating(WHOLE_4X4)).toBe(true);

    heightmap.rockHardness[1][1] = 0;
    renderer.redraw();
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(false);
  });

  it("only reflects lava within the last-drawn bounds, not the whole map", () => {
    const heightmap = flatHeightmap(10, 10, 5);
    heightmap.rockHardness[8][8] = VOLCANO_ROCK_HARDNESS; // outside the bounds redrawn below
    const renderer = new IsoRenderer(heightmap);
    const nearCorner: TileBounds = { minX: 0, maxX: 2, minY: 0, maxY: 2 };
    const farCorner: TileBounds = { minX: 6, maxX: 9, minY: 6, maxY: 9 };

    renderer.redraw(nearCorner);
    expect(renderer.isAnimating(nearCorner)).toBe(false);

    renderer.redraw(farCorner);
    expect(renderer.isAnimating(farCorner)).toBe(true);
  });
});

describe("IsoRenderer.redraw with bounds", () => {
  it("draws far fewer tile quads when given a small bounds than the whole map", () => {
    const heightmap = flatHeightmap(40, 40, 5);
    const renderer = new IsoRenderer(heightmap);
    const polySpy = vi.spyOn(Graphics.prototype, "poly");

    polySpy.mockClear();
    renderer.redraw(); // whole map: 40*40 = 1600 tile quads
    const fullMapCalls = polySpy.mock.calls.length;

    polySpy.mockClear();
    renderer.redraw({ minX: 10, maxX: 14, minY: 10, maxY: 14 }); // 5*5 = 25 tile quads
    const boundedCalls = polySpy.mock.calls.length;

    expect(fullMapCalls).toBe(1600);
    expect(boundedCalls).toBe(25);
    polySpy.mockRestore();
  });
});

/** toScreen(x, y, 0) — the same projection visibleTileBounds inverts. */
function toScreenFlat(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_WIDTH / 2), y: (x + y) * (TILE_HEIGHT / 2) };
}

describe("visibleTileBounds", () => {
  it("round-trips a single corner back to its own tile, with no margin", () => {
    const bounds = visibleTileBounds([toScreenFlat(10, 6)], 64, 64, 0);
    expect(bounds).toEqual({ minX: 10, maxX: 10, minY: 6, maxY: 6 });
  });

  it("covers every corner of a screen rectangle, not just the first", () => {
    const corners = [toScreenFlat(5, 5), toScreenFlat(20, 5), toScreenFlat(20, 20), toScreenFlat(5, 20)];
    const bounds = visibleTileBounds(corners, 64, 64, 0);
    expect(bounds).toEqual({ minX: 5, maxX: 20, minY: 5, maxY: 20 });
  });

  it("pads the exact bounds by the given margin", () => {
    const bounds = visibleTileBounds([toScreenFlat(10, 10)], 64, 64, 3);
    expect(bounds).toEqual({ minX: 7, maxX: 13, minY: 7, maxY: 13 });
  });

  it("clamps to the map's own bounds instead of returning negative or out-of-range tiles", () => {
    const bounds = visibleTileBounds([toScreenFlat(0, 0)], 20, 20, 5);
    expect(bounds).toEqual({ minX: 0, maxX: 5, minY: 0, maxY: 5 });

    const farCorner = visibleTileBounds([toScreenFlat(19, 19)], 20, 20, 5);
    expect(farCorner).toEqual({ minX: 14, maxX: 19, minY: 14, maxY: 19 });
  });
});

describe("volcanoGlowIntensity", () => {
  it("is zero once rockHardness has fully cooled, regardless of the pulse phase", () => {
    for (let t = 0; t < 3; t += 0.3) {
      expect(volcanoGlowIntensity(0, VOLCANO_ROCK_HARDNESS, t, 0.5)).toBe(0);
    }
  });

  it("glows brighter, on average, the more rockHardness is left", () => {
    // Average over a full pulse cycle to compare base brightness levels
    // without the pulse itself (see LAVA_PULSE_SPEED) muddying the comparison.
    const averageOver = (hardness: number) => {
      let sum = 0;
      const samples = 20;
      for (let i = 0; i < samples; i++) {
        sum += volcanoGlowIntensity(hardness, VOLCANO_ROCK_HARDNESS, (i / samples) * (2 * Math.PI), 0);
      }
      return sum / samples;
    };

    expect(averageOver(VOLCANO_ROCK_HARDNESS)).toBeGreaterThan(averageOver(VOLCANO_ROCK_HARDNESS / 2));
    expect(averageOver(VOLCANO_ROCK_HARDNESS / 2)).toBeGreaterThan(averageOver(0));
  });

  it("pulses over time rather than sitting at a flat brightness", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 3; t += 0.1) {
      seen.add(Math.round(volcanoGlowIntensity(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS, t, 0) * 100));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("gives two tiles different pulse phases so they don't flicker in unison", () => {
    const a = volcanoGlowIntensity(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS, 1.23, 0.1);
    const b = volcanoGlowIntensity(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS, 1.23, 0.7);
    expect(a).not.toBeCloseTo(b, 5);
  });

  it("gives the same inputs the same result (deterministic, not tied to draw order)", () => {
    expect(volcanoGlowIntensity(9, 20, 1.5, 0.3)).toBe(volcanoGlowIntensity(9, 20, 1.5, 0.3));
  });
});
