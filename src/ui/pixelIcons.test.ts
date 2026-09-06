import { describe, expect, it } from "vitest";
import { ATLAS_FRAME_KEYS, iconFrameKey, type IconKind } from "./pixelIcons";

const ALL_KINDS: IconKind[] = [
  "raise",
  "lower",
  "flatten",
  "shrine",
  "earthquake",
  "swamp",
  "holyWater",
  "tornado",
  "firePillar",
  "lightning",
  "storm",
  "hurricane",
  "perseus",
  "hercules",
  "odysseus",
  "achilles",
  "adonis",
  "helen",
  "guardian",
  "forest",
  "flower",
  "fireRain",
  "volcano",
  "reef",
  "road",
  "fungus",
  "tsunami",
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

/**
 * The same bidirectional guard the walker and house atlases carry. This key
 * and frame_key() in tools/sprites/icons.py are built independently in two
 * languages, and a disagreement wouldn't throw — the frame lookup would
 * come back undefined and the button would render blank.
 *
 * The checks that used to live here (every icon is 16x16, none is blank, no
 * two share a silhouette) moved to _validate() in tools/sprites/icons.py.
 * The patterns are the art now, so those are defects in that file, and CI's
 * `npm run sprites:check` builds every sheet and so runs them.
 */
describe("iconFrameKey", () => {
  it("produces only keys the committed atlas actually contains", () => {
    const atlas = new Set(ATLAS_FRAME_KEYS);
    const asked = ALL_KINDS.map(iconFrameKey);

    expect(asked.filter((key) => !atlas.has(key))).toEqual([]);
  });

  it("uses every frame the atlas ships — no dead art", () => {
    const asked = new Set(ALL_KINDS.map(iconFrameKey));

    expect(ATLAS_FRAME_KEYS.filter((key) => !asked.has(key))).toEqual([]);
  });

  it("gives every icon kind its own key", () => {
    expect(new Set(ALL_KINDS.map(iconFrameKey)).size).toBe(ALL_KINDS.length);
  });
});
