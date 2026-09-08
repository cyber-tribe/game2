import { describe, expect, it } from "vitest";
import { MAX_STAGE_MARKS } from "../game/constants";
import { describeMatchEvent, describeStageRating, formatMatchTime } from "./matchEventLabels";

describe("describeMatchEvent", () => {
  it("describes a plain miracle event with the acting faction as subject", () => {
    expect(describeMatchEvent("earthquake", "player")).toBe("あなたが地震を起こした");
    expect(describeMatchEvent("volcano", "enemy")).toBe("敵が火山を起こした");
    expect(describeMatchEvent("armageddon", "enemy")).toBe("敵が最終決戦を発動した");
  });

  it("names the other faction's house for houseCaptured/houseBurned, regardless of who acted", () => {
    expect(describeMatchEvent("houseCaptured", "player")).toBe("あなたが敵の家を奪った");
    expect(describeMatchEvent("houseCaptured", "enemy")).toBe("敵があなたの家を奪った");
    expect(describeMatchEvent("houseBurned", "player")).toBe("あなたが敵の家を焼き払った");
  });

  it("describes houseReachedCastle by whose house it was, using the Japanese level name rather than the internal identifier", () => {
    expect(describeMatchEvent("houseReachedCastle", "player")).toBe("あなたの家が城砦まで発展した");
    expect(describeMatchEvent("houseReachedCastle", "enemy")).toBe("敵の家が城砦まで発展した");
  });
});

describe("formatMatchTime", () => {
  it("formats seconds as m:ss", () => {
    expect(formatMatchTime(0)).toBe("0:00");
    expect(formatMatchTime(8)).toBe("0:08");
    expect(formatMatchTime(75)).toBe("1:15");
    expect(formatMatchTime(130)).toBe("2:10");
  });

  it("truncates fractional seconds rather than rounding", () => {
    expect(formatMatchTime(59.9)).toBe("0:59");
  });
});
/**
 * 「面の評価は稲妻マーク10個（約5万点）が上限」 — the original shows the
 * stage's rating as a row of ten bolts, not as a number.
 */
describe("describeStageRating", () => {
  it("draws ten marks, whatever the score", () => {
    for (const marks of [0, 3, 7, 10]) {
      expect([...describeStageRating(marks)].length).toBe(MAX_STAGE_MARKS);
    }
  });

  it("fills as many as were earned", () => {
    expect(describeStageRating(0)).toBe("・・・・・・・・・・");
    expect(describeStageRating(3)).toBe("⚡⚡⚡・・・・・・・");
    expect(describeStageRating(MAX_STAGE_MARKS)).toBe("⚡".repeat(MAX_STAGE_MARKS));
  });

  it("clamps rather than drawing a broken row", () => {
    expect(describeStageRating(-2)).toBe(describeStageRating(0));
    expect(describeStageRating(99)).toBe(describeStageRating(MAX_STAGE_MARKS));
  });
});
