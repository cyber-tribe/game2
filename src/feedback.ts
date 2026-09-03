import type { GameOutcome, MatchEvent } from "./game/simulation";
import { formatMatchTime } from "./render/matchEventLabels";

/**
 * Where post-game feedback goes — see plan/0040-post-game-feedback.md.
 * Deliberately this repo's own issue tracker rather than a form or survey
 * service: it's the one destination that needs zero new infrastructure and
 * puts feedback directly where development decisions already get made.
 */
const FEEDBACK_REPO_ISSUE_URL = "https://github.com/cyber-tribe/game2/issues/new";

/**
 * Builds a GitHub "new issue" URL prefilled with a feedback template plus a
 * short, read-only summary of the match just played (result, duration,
 * event count) — context a player would otherwise have to type out by hand,
 * and the kind of detail that makes a one-line "楽しかった" report
 * actionable instead of just a vibe.
 */
export function buildFeedbackIssueUrl(outcome: GameOutcome, events: readonly MatchEvent[]): string {
  const resultLine = outcome.winner ? `勝敗: ${outcome.winner} の勝利` : "勝敗: 引き分け";
  const durationLine = events.length > 0 ? `試合時間: 約${formatMatchTime(events[events.length - 1].time)}` : null;

  const body = [
    "## 感想・気づいたこと",
    "",
    "(良かった点・気になった点・もう一度遊びたいと思ったか、など自由に書いてください)",
    "",
    "## プレイ情報",
    resultLine,
    ...(durationLine ? [durationLine] : []),
    `記録されたイベント数: ${events.length}`,
  ].join("\n");

  const params = new URLSearchParams({ title: "プレイフィードバック", body, labels: "feedback" });
  return `${FEEDBACK_REPO_ISSUE_URL}?${params.toString()}`;
}
