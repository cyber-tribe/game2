import { describe, expect, it } from "vitest";
import {
  ARMAGEDDON_MANA_COST,
  EARTHQUAKE_MANA_COST,
  FIRE_PILLAR_MANA_COST,
  FUNGUS_MANA_COST,
  LIGHTNING_MANA_COST,
  MEGALITH_MANA_COST,
  SWAMP_MANA_COST,
  TORNADO_MANA_COST,
  TSUNAMI_MANA_COST,
  WHIRLPOOL_MANA_COST,
} from "./constants";

/**
 * 原作の攻略資料は**マナの絶対値をどこにも書いていない**。書いてあるのは
 * 「安い」「多い」「この順に少ない」という**関係**だけで、game2 の数値は
 * game2 のマナ経済の上で較正されたものである（`docs/original-miracles.md`
 * の保留の項と同じ理由）。
 *
 * だからここで守るのは数値ではなく、資料がはっきり書いている**順序**で
 * ある。数値の調整は自由だが、この順序を壊す調整は原作から離れる。
 * 各テストは根拠にした一文を引いてある。
 */
describe("原作が明言しているマナの大小", () => {
  /** No.24「必要なマナの(おそらくは)少ない順に挙げます。1.渦巻き 2.毒カビ 3.地下巨石」 */
  it("島を削る3手を、資料が挙げた安い順に並べる", () => {
    expect(WHIRLPOOL_MANA_COST).toBeLessThan(FUNGUS_MANA_COST);
    expect(FUNGUS_MANA_COST).toBeLessThan(MEGALITH_MANA_COST);
  });

  /** 渦巻き「消費マナがかなり少ない」——竜巻を海へ出すより安い、と対比されている。 */
  it("渦巻きを竜巻より、そして沼より安く保つ", () => {
    expect(WHIRLPOOL_MANA_COST).toBeLessThan(TORNADO_MANA_COST);
    expect(WHIRLPOOL_MANA_COST).toBeLessThan(SWAMP_MANA_COST);
  });

  /** 沼「この手の神技の中ではかなり少ないマナで発動でき」——トラップ系で一番安い。 */
  it("沼をトラップ系の中で一番安く保つ", () => {
    expect(SWAMP_MANA_COST).toBeLessThan(EARTHQUAKE_MANA_COST);
    expect(SWAMP_MANA_COST).toBeLessThan(FUNGUS_MANA_COST);
  });

  /** 地震「沼と同様に落ちると死ぬトラップ系の攻撃神技だが、マナ消費が多いぶん……強力」 */
  it("地震を沼より高く保つ", () => {
    expect(EARTHQUAKE_MANA_COST).toBeGreaterThan(SWAMP_MANA_COST);
  });

  /**
   * 毒カビ「マナ消費が比較的多い……と短所ばかりが目立つ」。
   *
   * 「比較的」の相手は書かれていないので、**沼より高い**ことだけを見る
   * （沼は「かなり少ない」と名指しされている側）。地震との上下は資料が
   * 何も言っていないので、ここでは主張しない——上に置く根拠が無い。
   */
  it("毒カビを、安いと名指しされた沼より高く保つ", () => {
    expect(FUNGUS_MANA_COST).toBeGreaterThan(SWAMP_MANA_COST);
  });

  /** No.34-36「比較的マナ消費の少ない雷や沼で……早い段階で主導権を取れる」 */
  it("雷を沼と並ぶ「安く開ける手」に保つ", () => {
    // 同額である必要はない。開幕に撃てる側であればよい。
    expect(Math.abs(LIGHTNING_MANA_COST - SWAMP_MANA_COST)).toBeLessThanOrEqual(4);
    expect(LIGHTNING_MANA_COST).toBeLessThan(EARTHQUAKE_MANA_COST);
  });

  /** No.43-45「雷より森＋火柱が得意であれば……マナ消費が比較的多いため、難易度がいくらか上がります」 */
  it("火柱を雷より高く保つ", () => {
    expect(FIRE_PILLAR_MANA_COST).toBeGreaterThan(LIGHTNING_MANA_COST);
  });

  /** No.46-48「敵は津波も持っていますが かなりのマナが必要なので」 */
  it("津波を最上位の値段に保つ", () => {
    for (const cost of [SWAMP_MANA_COST, EARTHQUAKE_MANA_COST, FUNGUS_MANA_COST, FIRE_PILLAR_MANA_COST, MEGALITH_MANA_COST]) {
      expect(TSUNAMI_MANA_COST).toBeGreaterThan(cost * 2);
    }
  });

  /** No.01「マナが貯まり次第アーマゲドンで終了」——貯め切って撃つ、最後の一手。 */
  it("最終決戦をどの奇跡よりも高く保つ", () => {
    expect(ARMAGEDDON_MANA_COST).toBeGreaterThan(TSUNAMI_MANA_COST);
  });
});
