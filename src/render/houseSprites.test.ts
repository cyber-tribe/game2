import { describe, expect, it } from "vitest";
import type { FactionId, HouseLevel } from "../game/components";
import { ATLAS_FRAME_KEYS, houseFrameKey } from "./houseSprites";

const FACTIONS: FactionId[] = ["player", "enemy"];
const LEVELS: HouseLevel[] = ["hut", "lodge", "manor", "castle"];

describe("houseFrameKey", () => {
  /**
   * Same guard as walkerSprites.test.ts, for the same reason: this key and
   * frame_key() in tools/sprites/houses.py are built independently in two
   * languages, and a disagreement wouldn't throw — the texture lookup would
   * return undefined and the building would silently not render.
   */
  it("produces only keys the committed atlas actually contains", () => {
    const atlas = new Set(ATLAS_FRAME_KEYS);
    const asked = FACTIONS.flatMap((faction) => LEVELS.map((level) => houseFrameKey(faction, level)));

    expect(asked.filter((key) => !atlas.has(key))).toEqual([]);
  });

  it("uses every frame the atlas ships — no dead art", () => {
    const asked = new Set(FACTIONS.flatMap((faction) => LEVELS.map((level) => houseFrameKey(faction, level))));

    expect(ATLAS_FRAME_KEYS.filter((key) => !asked.has(key))).toEqual([]);
  });

  it("gives every level and faction its own key", () => {
    const keys = new Set(FACTIONS.flatMap((faction) => LEVELS.map((level) => houseFrameKey(faction, level))));

    expect(keys.size).toBe(FACTIONS.length * LEVELS.length);
  });
});
