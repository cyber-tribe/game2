import { describe, expect, it } from "vitest";
import { MEANDER_PATTERN, MEANDER_SIZE, STONE_GRAIN_SIZE_PX, stoneToneAt } from "./panelFrame";

describe("MEANDER_PATTERN", () => {
  it("is a square block of pixels and nothing else", () => {
    expect(MEANDER_PATTERN).toHaveLength(MEANDER_SIZE);
    for (const row of MEANDER_PATTERN) {
      expect(row).toHaveLength(MEANDER_SIZE);
      expect(row).toMatch(/^[.#]+$/);
    }
  });

  /**
   * A 雷文 is one continuous line, not a row of stamps: the rail has to
   * leave the right edge exactly where the next repeat's rail begins, or a
   * repeated strip shows a break at every seam.
   */
  it("carries its rail across both edges, so repeats join into one band", () => {
    const rail = MEANDER_SIZE - 1;

    expect(MEANDER_PATTERN[rail][0]).toBe("#");
    expect(MEANDER_PATTERN[rail][MEANDER_SIZE - 1]).toBe("#");
  });

  /**
   * And the spiral has to hang off that rail rather than float beside it —
   * every drawn pixel reachable from every other, walking only up, down,
   * left and right.
   */
  it("is a single connected line", () => {
    const drawn = new Set<string>();
    for (let y = 0; y < MEANDER_SIZE; y++) {
      for (let x = 0; x < MEANDER_SIZE; x++) {
        if (MEANDER_PATTERN[y][x] === "#") drawn.add(`${x},${y}`);
      }
    }

    const seen = new Set<string>();
    const queue = [[...drawn][0]];
    while (queue.length > 0) {
      const key = queue.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const [x, y] = key.split(",").map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = `${x + dx},${y + dy}`;
        if (drawn.has(next) && !seen.has(next)) queue.push(next);
      }
    }

    expect(seen.size).toBe(drawn.size);
  });
});

describe("stoneToneAt", () => {
  const tones = () => {
    const counts = { base: 0, pit: 0, grit: 0 };
    for (let y = 0; y < STONE_GRAIN_SIZE_PX; y++) {
      for (let x = 0; x < STONE_GRAIN_SIZE_PX; x++) counts[stoneToneAt(x, y)] += 1;
    }
    return counts;
  };

  it("leaves the slab mostly its own flat tone", () => {
    const { base } = tones();

    expect(base / (STONE_GRAIN_SIZE_PX * STONE_GRAIN_SIZE_PX)).toBeGreaterThan(0.85);
  });

  it("pits it about twice as often as it lifts it", () => {
    const { pit, grit } = tones();

    expect(grit).toBeGreaterThan(0);
    expect(pit / grit).toBeGreaterThan(1.4);
    expect(pit / grit).toBeLessThan(2.6);
  });

  /**
   * The repeat has to be big enough that the panel never shows the same
   * arrangement twice in one glance — a small one reads as a woven grid
   * rather than as grain, which is exactly how the first cut of this failed
   * at 7px.
   */
  it("repeats over a span wider than a command button", () => {
    expect(STONE_GRAIN_SIZE_PX).toBeGreaterThanOrEqual(24);
  });
});
