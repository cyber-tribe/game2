import { describe, expect, it } from "vitest";
import { describeMatchEvent, formatMatchTime } from "./matchEventLabels";

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
