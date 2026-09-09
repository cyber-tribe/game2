import { describe, expect, it } from "vitest";
import { MAX_STAGE_MARKS, MAX_STAGE_SCORE, SCORE_PER_SECOND, SCORE_VALUE } from "./constants";
import { scoreValue, stageRating } from "./score";

/**
 * 原作「経験点の稼ぎ方（効果の高い順）：**地下巨石・岩礁を使う**／敵リーダー
 * を倒す／ウォーカー同士の直接戦闘に勝つ／時間が経つ」. The order is the
 * design; the magnitudes are game2's own.
 */
describe("scoreValue", () => {
  it("ranks the four sources the way the source ranks them", () => {
    expect(scoreValue("stonework")).toBeGreaterThan(scoreValue("enemyLeader"));
    expect(scoreValue("enemyLeader")).toBeGreaterThan(scoreValue("fightWon"));
    expect(scoreValue("fightWon")).toBeGreaterThan(scoreValue("time"));
  });

  it("reads time as a per-second rate and the rest as per occurrence", () => {
    expect(scoreValue("time")).toBe(SCORE_PER_SECOND);
    expect(scoreValue("stonework")).toBe(SCORE_VALUE.stonework);
  });

  /**
   * 「低コストでスコア効率が高い」 is said of 岩礁 in particular: a player
   * chasing marks builds rather than fights, and the numbers have to make
   * that true rather than merely say it.
   */
  it("makes one 地下巨石 worth more than a long skirmish", () => {
    expect(scoreValue("stonework")).toBeGreaterThan(scoreValue("fightWon") * 10);
  });
});

describe("stageRating", () => {
  it("gives no marks for nothing at all", () => {
    expect(stageRating(0, MAX_STAGE_SCORE)).toBe(0);
  });

  it("fills all ten at the top of the scale", () => {
    expect(stageRating(MAX_STAGE_SCORE, MAX_STAGE_SCORE)).toBe(MAX_STAGE_MARKS);
  });

  it("rounds down, so the last mark means the bar was actually filled", () => {
    expect(stageRating(MAX_STAGE_SCORE * 0.99, MAX_STAGE_SCORE)).toBe(MAX_STAGE_MARKS - 1);
  });

  it("scales linearly in between", () => {
    expect(stageRating(MAX_STAGE_SCORE * 0.5, MAX_STAGE_SCORE)).toBe(MAX_STAGE_MARKS / 2);
  });

  it("caps rather than overflowing on an exceptional match", () => {
    expect(stageRating(MAX_STAGE_SCORE * 5, MAX_STAGE_SCORE)).toBe(MAX_STAGE_MARKS);
  });

  it("never goes negative", () => {
    expect(stageRating(-100, MAX_STAGE_SCORE)).toBe(0);
  });
});
