import { describe, expect, it } from "vitest";
import { HOUSE_LEVELS } from "../game/constants";
import { describeInspectableEntity } from "./entityInfoLabel";

describe("describeInspectableEntity", () => {
  it("describes a player walker with its strength and state", () => {
    const text = describeInspectableEntity({
      kind: "walker",
      faction: "player",
      position: { x: 1, y: 1 },
      strength: 2.3,
      state: "seeking",
    });

    expect(text).toBe("あなたのウォーカー 強さ2.3（定住地を探索中）");
  });

  it("describes an enemy walker as 敵", () => {
    const text = describeInspectableEntity({
      kind: "walker",
      faction: "enemy",
      position: { x: 1, y: 1 },
      strength: 1,
      state: "knight",
    });

    expect(text).toBe("敵のウォーカー 強さ1.0（騎士化済み）");
  });

  it("describes a house with its level, population, and capacity", () => {
    const text = describeInspectableEntity({
      kind: "house",
      faction: "player",
      position: { x: 5, y: 5 },
      level: "manor",
      population: 12.7,
      capacity: HOUSE_LEVELS.manor.capacity,
    });

    expect(text).toBe(`あなたの大きな家 人口13/${HOUSE_LEVELS.manor.capacity}`);
  });
});
