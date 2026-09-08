import { describe, expect, it } from "vitest";
import {
  ENEMY_SIGNATURE_MIRACLE,
  MIRACLE_SCHOOL,
  MIRACLE_SCHOOLS,
  miraclesOfSchool,
  type MiracleSchool,
} from "./miracleSchools";
import { ALL_MIRACLES, WORLDS } from "./worlds";

/**
 * The six schools as docs/original-miracles.md counts them, minus what
 * game2 has no MiracleId for: 土地上下 (the always-available terrain
 * edits) in 人.
 *
 * 水 used to be 4 here as well, because 渦巻き could only be born from a
 * 竜巻 that wandered into water. The original lists it in 全奇跡 under 水
 * with a description of its own, so it is castable there and now is here
 * too — 水 is the original's 5 again, and only 人 (whose fifth is the
 * always-available 土地上下, plus game2's own 守護者化) and 火 (which the
 * original itself gives only 4) differ from the article's table.
 */
const ORIGINAL_SIZES: Record<MiracleSchool, number> = {
  human: 5, // 集結地移動, ペルセウス, 病原菌, 最終決戦 + game2's own 守護者化
  plant: 5,
  earth: 5,
  air: 5,
  fire: 4,
  water: 5, // 岩礁, 渦巻き, 聖水の泉, トロイのヘレン, 津波
};

describe("MIRACLE_SCHOOL", () => {
  it("files every miracle in the game, and only once", () => {
    expect(Object.keys(MIRACLE_SCHOOL).sort()).toEqual([...ALL_MIRACLES].sort());
  });

  it("keeps the schools the size the original's own tables are", () => {
    for (const { id } of MIRACLE_SCHOOLS) {
      expect({ id, size: miraclesOfSchool(id).length }).toEqual({ id, size: ORIGINAL_SIZES[id] });
    }
  });

  /** One hero per school is the original's own pattern. */
  it("gives each school its own hero", () => {
    const heroes = { perseus: "human", adonis: "plant", hercules: "earth", odysseus: "air", achilles: "fire", helen: "water" } as const;

    for (const [hero, school] of Object.entries(heroes)) {
      expect({ hero, school: MIRACLE_SCHOOL[hero as keyof typeof heroes] }).toEqual({ hero, school });
    }
  });
});

describe("ENEMY_SIGNATURE_MIRACLE", () => {
  it("gives every school a signature, and takes it from that school", () => {
    for (const { id } of MIRACLE_SCHOOLS) {
      expect({ id, school: MIRACLE_SCHOOL[ENEMY_SIGNATURE_MIRACLE[id]] }).toEqual({ id, school: id });
    }
  });

  /**
   * A god can only cast what its world unlocks — the same allowedMiracles
   * gate the player plays under. A world whose god's signature is locked
   * would advertise a school in the world select and then never show it.
   */
  it("is unlocked in every world that advertises its school", () => {
    for (const world of WORLDS) {
      const signature = ENEMY_SIGNATURE_MIRACLE[world.enemySchool];
      expect({ world: world.id, canCast: world.allowedMiracles.includes(signature) }).toEqual({
        world: world.id,
        canCast: true,
      });
    }
  });

  it("gives the campaign all six schools rather than repeating a couple", () => {
    expect(new Set(WORLDS.map((world) => world.enemySchool)).size).toBe(MIRACLE_SCHOOLS.length);
  });
});
