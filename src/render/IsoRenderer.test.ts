import { describe, expect, it } from "vitest";
import { VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";
import { IsoRenderer, volcanoTileColor } from "./IsoRenderer";

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

describe("volcanoTileColor", () => {
  it("is fully magma-colored at full hardness and fully cooled-rock-colored at zero", () => {
    const hot = volcanoTileColor(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS);
    const cold = volcanoTileColor(0, VOLCANO_ROCK_HARDNESS);

    // Magma is the warmer (redder, less blue) of the two ends of the gradient.
    expect((hot >> 16) & 0xff).toBeGreaterThan((cold >> 16) & 0xff);
    expect(hot & 0xff).toBeLessThan(cold & 0xff);
  });

  it("cools down gradually as hardness decreases, not all at once", () => {
    const full = volcanoTileColor(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS);
    const half = volcanoTileColor(VOLCANO_ROCK_HARDNESS / 2, VOLCANO_ROCK_HARDNESS);
    const none = volcanoTileColor(0, VOLCANO_ROCK_HARDNESS);

    const redOf = (c: number) => (c >> 16) & 0xff;
    expect(redOf(half)).toBeLessThan(redOf(full));
    expect(redOf(half)).toBeGreaterThan(redOf(none));
  });

  it("gives the same hardness the same color regardless of call order (pure function)", () => {
    expect(volcanoTileColor(9, 20)).toBe(volcanoTileColor(9, 20));
  });
});
