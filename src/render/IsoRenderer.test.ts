import { describe, expect, it } from "vitest";
import { VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";
import { IsoRenderer, volcanoGlowIntensity } from "./IsoRenderer";

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
