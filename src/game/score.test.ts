import { describe, expect, it } from "vitest";
import { MAX_STAGE_MARKS, MAX_STAGE_SCORE, SCORE_PER_SECOND, SCORE_VALUE } from "./constants";
import { scoreValue, stageRating } from "./score";

/**
 * 資料がスコアについて書いているのは**2つだけ**である。
 *
 * - 地下巨石「この神技には『なぜか経験点が非常に高い』という特徴があるため、
 *   もっぱら点数稼ぎに使われる」
 * - 岩礁「地下巨石ほどではないがそれなりに経験点が入るので点数稼ぎに」
 *
 * かつてここには4つの源（地下巨石・岩礁／敵リーダー撃破／直接戦闘の勝利／
 * 時間経過）とその順位があり、`docs/original-miracles.md` の
 * 「経験点の稼ぎ方（効果の高い順）」という一行を根拠にしていた。
 * **その一行は資料に存在しない**（`plan/0167`）。
 */
describe("scoreValue", () => {
  it("pays for the two the guide names, and ranks them the way it ranks them", () => {
    // 「なぜか経験点が非常に高い」 vs 「地下巨石ほどではないが、それなりに」
    expect(scoreValue("megalith")).toBeGreaterThan(scoreValue("reef"));
    expect(scoreValue("reef")).toBeGreaterThan(0);
  });

  it("keeps the trickle far below either of them", () => {
    // 時間は game2 のもので資料の言葉ではない。資料が名指しした2つを
    // 上回ってはいけない——それでは「地下巨石で点を稼ぐ」が嘘になる。
    expect(scoreValue("time") * 60).toBeLessThan(scoreValue("reef"));
  });

  it("reads time as a per-second rate and the rest as per occurrence", () => {
    expect(scoreValue("time")).toBe(SCORE_PER_SECOND);
    expect(scoreValue("megalith")).toBe(SCORE_VALUE.megalith);
    expect(scoreValue("reef")).toBe(SCORE_VALUE.reef);
  });

  /**
   * 「もっぱら点数稼ぎに使われる」——マークを埋めたいなら建てることになる、
   * というのが原作の設計である。
   */
  it("makes 地下巨石 the way to fill the bar", () => {
    expect(MAX_STAGE_SCORE / scoreValue("megalith")).toBeLessThan(30);
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
