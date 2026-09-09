import { describe, expect, it } from "vitest";
import { minimapHeight } from "./Minimap";

describe("minimapHeight", () => {
  /**
   * The reason this is exported at all: the map is set into a lump of rock
   * that tapers below it and sheds shards into the void, so anything laid
   * out under the minimap by its `size` alone lands inside the island.
   * That is exactly what happened to the HUD's terrain lines.
   */
  it("reaches well below the map square it holds", () => {
    expect(minimapHeight(72)).toBeGreaterThan(72);
  });

  it("grows with the map square", () => {
    expect(minimapHeight(144)).toBeGreaterThan(minimapHeight(72));
  });
});
