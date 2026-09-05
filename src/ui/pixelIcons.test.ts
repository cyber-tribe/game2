import { describe, expect, it } from "vitest";
import { buildIconGrid, ICON_SIZE, type IconKind } from "./pixelIcons";

const ALL_KINDS: IconKind[] = [
  "raise",
  "lower",
  "flatten",
  "shrine",
  "earthquake",
  "swamp",
  "knight",
  "guardian",
  "volcano",
  "flood",
  "armageddon",
  "inspect",
  "settle",
  "gather",
  "goToShrine",
  "fight",
  "releasePopulation",
  "mana",
  "population",
];

function paintedPixelCount(kind: IconKind): number {
  const grid = buildIconGrid(kind);
  return grid.flat().filter((cell) => cell !== undefined).length;
}

describe("buildIconGrid", () => {
  it("builds a 16x16 grid for every icon kind", () => {
    for (const kind of ALL_KINDS) {
      const grid = buildIconGrid(kind);
      expect(grid).toHaveLength(ICON_SIZE);
      for (const row of grid) expect(row).toHaveLength(ICON_SIZE);
    }
  });

  it("paints at least some pixels for every icon — none render as a blank square", () => {
    for (const kind of ALL_KINDS) {
      expect(paintedPixelCount(kind)).toBeGreaterThan(0);
    }
  });

  it("gives every icon kind a visually distinct silhouette (no two share the same painted-pixel pattern)", () => {
    const signatures = new Map<string, IconKind>();
    for (const kind of ALL_KINDS) {
      const grid = buildIconGrid(kind);
      const signature = grid.map((row) => row.map((cell) => (cell === undefined ? "." : "#")).join("")).join("|");
      const existing = signatures.get(signature);
      expect(existing, `${kind} has the same silhouette as ${existing}`).toBeUndefined();
      signatures.set(signature, kind);
    }
  });
});
