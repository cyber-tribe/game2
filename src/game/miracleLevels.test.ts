import { describe, expect, it } from "vitest";
import { DEFAULT_FUNGUS_RADIUS } from "../world/heightmap";
import {
  LIGHTNING_SCATTER,
  MAX_MIRACLE_LEVEL,
  MIRACLE_LEVEL_MIN_SCATTER,
  MIRACLE_LEVEL_STEP,
} from "./constants";
import {
  awardStage,
  decodeExperience,
  durationScaleAt,
  encodeExperience,
  fungusRadiusAt,
  levelOf,
  lightningScatterAt,
  noExperience,
} from "./miracleLevels";
import { MIRACLE_SCHOOLS } from "./miracleSchools";

describe("levelOf", () => {
  it("starts every school at 1", () => {
    const fresh = noExperience();
    for (const { id } of MIRACLE_SCHOOLS) {
      expect({ id, level: levelOf(fresh, id) }).toEqual({ id, level: 1 });
    }
  });

  it("gains a level every MIRACLE_LEVEL_STEP points", () => {
    const experience = { ...noExperience(), air: MIRACLE_LEVEL_STEP * 2 };

    expect(levelOf(experience, "air")).toBe(3);
  });

  it("caps at MAX_MIRACLE_LEVEL", () => {
    const experience = { ...noExperience(), air: MIRACLE_LEVEL_STEP * 1000 };

    expect(levelOf(experience, "air")).toBe(MAX_MIRACLE_LEVEL);
  });

  it("keeps the six schools separate", () => {
    const experience = { ...noExperience(), fire: MIRACLE_LEVEL_STEP };

    expect(levelOf(experience, "fire")).toBe(2);
    expect(levelOf(experience, "water")).toBe(1);
  });
});

/**
 * 「各カテゴリーのレベルを上げていく」 — game2 reads it as "you level what
 * you use", which is what keeps the six categories from being one pool
 * wearing six names.
 */
describe("awardStage", () => {
  it("pays the schools of the miracles actually cast", () => {
    const earned = awardStage(noExperience(), ["lightning", "firePillar"], 7);

    expect(earned.air).toBe(7);
    expect(earned.fire).toBe(7);
    expect(earned.earth).toBe(0);
  });

  it("pays a school once however many of its miracles were cast", () => {
    const earned = awardStage(noExperience(), ["lightning", "tornado", "storm"], 5);

    expect(earned.air).toBe(5);
  });

  it("adds to what was already learned", () => {
    const earned = awardStage({ ...noExperience(), air: 12 }, ["lightning"], 4);

    expect(earned.air).toBe(16);
  });

  it("pays nothing for a stage where nothing was cast", () => {
    expect(awardStage(noExperience(), [], 10)).toEqual(noExperience());
  });

  it("never takes anything away", () => {
    const before = { ...noExperience(), air: 30 };

    expect(awardStage(before, ["lightning"], -5).air).toBe(30);
  });

  it("leaves the experience it was given untouched", () => {
    const before = noExperience();
    awardStage(before, ["lightning"], 7);

    expect(before.air).toBe(0);
  });
});

/** 「気レベルが低い段階では命中精度が非常に低く……レベルが上がると一撃必殺」. */
describe("lightningScatterAt", () => {
  it("is today's scatter at level 1, so an untrained god plays the game as it was", () => {
    expect(lightningScatterAt(1)).toBe(LIGHTNING_SCATTER);
  });

  it("tightens all the way to MIRACLE_LEVEL_MIN_SCATTER at the top", () => {
    expect(lightningScatterAt(MAX_MIRACLE_LEVEL)).toBeCloseTo(MIRACLE_LEVEL_MIN_SCATTER, 10);
  });

  it("only ever tightens", () => {
    for (let level = 2; level <= MAX_MIRACLE_LEVEL; level++) {
      expect(lightningScatterAt(level)).toBeLessThan(lightningScatterAt(level - 1));
    }
  });

  /** Even at its best it is a scatter of bolts, not a sniper's shot. */
  it("never collapses to a single point", () => {
    expect(lightningScatterAt(MAX_MIRACLE_LEVEL)).toBeGreaterThan(0);
  });

  it("clamps a level outside the range rather than extrapolating", () => {
    expect(lightningScatterAt(0)).toBe(lightningScatterAt(1));
    expect(lightningScatterAt(99)).toBe(lightningScatterAt(MAX_MIRACLE_LEVEL));
  });
});

/** 「地震・竜巻・嵐・火柱：効果の持続時間がそれぞれのレベルで伸びる」 — one rule for the four. */
describe("durationScaleAt", () => {
  it("leaves level 1 exactly as it is", () => {
    expect(durationScaleAt(1)).toBe(1);
  });

  it("only ever lengthens", () => {
    for (let level = 2; level <= MAX_MIRACLE_LEVEL; level++) {
      expect(durationScaleAt(level)).toBeGreaterThan(durationScaleAt(level - 1));
    }
  });

  it("doubles at the top rather than running away", () => {
    expect(durationScaleAt(MAX_MIRACLE_LEVEL)).toBe(2);
  });

  it("clamps outside the range", () => {
    expect(durationScaleAt(-3)).toBe(1);
    expect(durationScaleAt(99)).toBe(durationScaleAt(MAX_MIRACLE_LEVEL));
  });
});

/** 「植物のレベルが高いと一瞬かなりえげつないことになる」. */
describe("fungusRadiusAt", () => {
  it("sows the usual patch at level 1", () => {
    expect(fungusRadiusAt(1)).toBe(DEFAULT_FUNGUS_RADIUS);
  });

  it("sows wider as the school grows, never narrower", () => {
    for (let level = 2; level <= MAX_MIRACLE_LEVEL; level++) {
      expect(fungusRadiusAt(level)).toBeGreaterThanOrEqual(fungusRadiusAt(level - 1));
    }
    expect(fungusRadiusAt(MAX_MIRACLE_LEVEL)).toBeGreaterThan(fungusRadiusAt(1));
  });

  it("stays a whole number of vertices", () => {
    for (let level = 1; level <= MAX_MIRACLE_LEVEL; level++) {
      expect(Number.isInteger(fungusRadiusAt(level))).toBe(true);
    }
  });
});

/**
 * game2 keeps campaign progress on paper (see worlds.ts's nextWorldId), so
 * the levels have to survive a round trip through a string a player types.
 */
describe("encodeExperience / decodeExperience", () => {
  it("round-trips", () => {
    const experience = { human: 0, plant: 7, earth: 40, air: 123, fire: 5, water: 1 };

    expect(decodeExperience(encodeExperience(experience))).toEqual(experience);
  });

  it("round-trips a fresh god", () => {
    expect(decodeExperience(encodeExperience(noExperience()))).toEqual(noExperience());
  });

  it("is a fixed width, so a mistyped code fails rather than decoding as something else", () => {
    expect(encodeExperience(noExperience())).toHaveLength(MIRACLE_SCHOOLS.length * 2);
    expect(decodeExperience("abc")).toBeUndefined();
    expect(decodeExperience("")).toBeUndefined();
  });

  it("refuses a code with characters that are not base-36 digits", () => {
    expect(decodeExperience("00000000000!")).toBeUndefined();
  });

  it("clamps rather than overflowing its two digits", () => {
    const huge = { ...noExperience(), air: 10_000_000 };
    const decoded = decodeExperience(encodeExperience(huge))!;

    expect(decoded.air).toBe(36 * 36 - 1);
    // Still enough to be maxed out, which is all the code has to preserve.
    expect(levelOf(decoded, "air")).toBe(MAX_MIRACLE_LEVEL);
  });
});
