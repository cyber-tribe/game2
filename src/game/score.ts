import { MAX_STAGE_MARKS, SCORE_PER_SECOND, SCORE_VALUE } from "./constants";

/**
 * What a stage's score is made of — 原作「経験点の稼ぎ方（効果の高い順）：
 * **地下巨石・岩礁を使う**／敵リーダーを倒す／ウォーカー同士の直接戦闘に
 * 勝つ／時間が経つ」(docs/original-miracles.md).
 *
 * The order in that sentence is the whole design: the two *building*
 * miracles are worth more than any amount of killing, which is why the
 * original says of 岩礁 that it is 「低コストでスコア効率が高い」. A player
 * chasing marks builds; a player chasing the win fights. They are not the
 * same game, and the score is what makes them different.
 */
export type ScoreSource = "stonework" | "enemyLeader" | "fightWon" | "time";

/**
 * The player's rating for a stage, 0 to MAX_STAGE_MARKS — the original's
 * 稲妻マーク, of which 「面の評価は稲妻マーク10個（約5万点）が上限」.
 *
 * The count is the original's; the 50,000 is not, and is deliberately not
 * transplanted. game2's score is built out of game2's own events at
 * game2's own rates, so the point at which the bar fills has to be
 * calibrated here (MAX_STAGE_SCORE) rather than borrowed — the same reason
 * 津波's 「3段」 was left alone (see docs/original-miracles.md).
 *
 * Rounded down, so the tenth mark means the bar was actually filled rather
 * than nearly.
 */
export function stageRating(score: number, maxScore: number): number {
  if (maxScore <= 0) return MAX_STAGE_MARKS;
  const marks = Math.floor((Math.max(0, score) / maxScore) * MAX_STAGE_MARKS);
  return Math.min(MAX_STAGE_MARKS, marks);
}

/** What one occurrence of `source` is worth; `time` is per second. */
export function scoreValue(source: ScoreSource): number {
  return source === "time" ? SCORE_PER_SECOND : SCORE_VALUE[source];
}
