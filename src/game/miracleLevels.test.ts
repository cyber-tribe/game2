import { describe, expect, it } from "vitest";
import { DEFAULT_FUNGUS_RADIUS } from "../world/heightmap";
import {
  LIGHTNING_SCATTER,
  MAX_MIRACLE_LEVEL,
  MAX_STAGE_MARKS,
  MIRACLE_LEVEL_MIN_SCATTER,
  MIRACLE_LEVEL_STEP,
} from "./constants";
import {
  allocate,
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
 * 原作の経験点は**プレイヤーが配分する**——「経験点を地と気レベルに重点配分
 * して下さい」「経験点の使い道に迷ったら水レベルを上げる」。使った系統へ
 * 自動で入る仕組みは game2 の発明だった（`plan/0168`）。
 */
describe("allocate", () => {
  it("puts a point where it is told", () => {
    const earned = allocate(noExperience(), "air");

    expect(earned.air).toBe(1);
    expect(earned.fire).toBe(0);
  });

  it("adds to what was already learned", () => {
    expect(allocate({ ...noExperience(), air: 12 }, "air").air).toBe(13);
  });

  it("takes as many points at once as it is given", () => {
    expect(allocate(noExperience(), "water", 7).water).toBe(7);
  });

  it("leaves the experience it was given untouched", () => {
    const before = noExperience();
    allocate(before, "air");

    expect(before.air).toBe(0);
  });

  it("never goes below nothing", () => {
    expect(allocate(noExperience(), "air", -5).air).toBe(0);
  });

  /** 「重点配分」——1系統へ寄せれば段が上がる。 */
  it("raises a level once MIRACLE_LEVEL_STEP points are in one school", () => {
    let earned = noExperience();
    for (let i = 0; i < MIRACLE_LEVEL_STEP; i++) earned = allocate(earned, "fire");

    expect(levelOf(earned, "fire")).toBe(2);
    expect(levelOf(earned, "air")).toBe(1);
  });

  /** 一面ぶん（稲妻マーク10個）を1系統に寄せても、いきなり最大にはならない。 */
  it("does not max a school out of one perfect stage", () => {
    let earned = noExperience();
    for (let i = 0; i < MAX_STAGE_MARKS; i++) earned = allocate(earned, "fire");

    expect(levelOf(earned, "fire")).toBeLessThan(MAX_MIRACLE_LEVEL);
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
