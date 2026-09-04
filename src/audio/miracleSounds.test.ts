import { describe, expect, it } from "vitest";
import { MIRACLE_SOUND_TYPES, RECIPES, playMiracleSound, type MiracleSoundType } from "./miracleSounds";

describe("RECIPES", () => {
  it("has a recipe for every MiracleSoundType", () => {
    for (const type of MIRACLE_SOUND_TYPES) {
      expect(RECIPES[type]).toBeDefined();
    }
    expect(Object.keys(RECIPES).sort()).toEqual([...MIRACLE_SOUND_TYPES].sort());
  });

  it("gives every recipe at least one audible layer (a tone or noise)", () => {
    for (const type of MIRACLE_SOUND_TYPES) {
      const recipe = RECIPES[type];
      expect(recipe.tones.length > 0 || recipe.noise !== undefined).toBe(true);
    }
  });

  it("keeps every tone layer's timing/gain positive and finite", () => {
    for (const type of MIRACLE_SOUND_TYPES) {
      for (const tone of RECIPES[type].tones) {
        expect(tone.duration).toBeGreaterThan(0);
        expect(tone.delay).toBeGreaterThanOrEqual(0);
        expect(tone.peakGain).toBeGreaterThan(0);
        expect(tone.startFrequency).toBeGreaterThan(0);
        expect(tone.endFrequency).toBeGreaterThan(0);
        expect(Number.isFinite(tone.duration)).toBe(true);
      }
    }
  });

  it("keeps every noise layer's timing/gain positive and finite, when present", () => {
    for (const type of MIRACLE_SOUND_TYPES) {
      const noise = RECIPES[type].noise;
      if (!noise) continue;
      expect(noise.duration).toBeGreaterThan(0);
      expect(noise.delay).toBeGreaterThanOrEqual(0);
      expect(noise.peakGain).toBeGreaterThan(0);
      expect(noise.filterFrequency).toBeGreaterThan(0);
    }
  });

  it("gives armageddon (the priciest miracle) a longer total sound than shrineMove (the cheapest)", () => {
    const totalDuration = (type: MiracleSoundType) => {
      const recipe = RECIPES[type];
      const toneEnd = Math.max(0, ...recipe.tones.map((t) => t.delay + t.duration));
      const noiseEnd = recipe.noise ? recipe.noise.delay + recipe.noise.duration : 0;
      return Math.max(toneEnd, noiseEnd);
    };

    expect(totalDuration("armageddon")).toBeGreaterThan(totalDuration("shrineMove"));
  });
});

describe("playMiracleSound", () => {
  it("does not throw for any miracle type, even without a usable AudioContext (e.g. this test's own environment)", () => {
    for (const type of MIRACLE_SOUND_TYPES) {
      expect(() => playMiracleSound(type)).not.toThrow();
    }
  });
});
