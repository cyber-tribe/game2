import { describe, expect, it } from "vitest";
import { buildFeedbackIssueUrl } from "./feedback";
import type { GameOutcome, MatchEvent } from "./game/simulation";

const WIN: GameOutcome = { over: true, winner: "player" };
const DRAW: GameOutcome = { over: true };
const EVENTS: MatchEvent[] = [
  { time: 12.4, faction: "player", type: "shrineMove" },
  { time: 75.3, faction: "enemy", type: "earthquake" },
];

describe("buildFeedbackIssueUrl", () => {
  it("points at this repo's GitHub issue tracker", () => {
    const url = new URL(buildFeedbackIssueUrl(WIN, EVENTS));

    expect(url.origin + url.pathname).toBe("https://github.com/cyber-tribe/game2/issues/new");
  });

  it("includes the winner and the last event's time in the body", () => {
    const url = new URL(buildFeedbackIssueUrl(WIN, EVENTS));
    const body = url.searchParams.get("body") ?? "";

    expect(body).toContain("player の勝利");
    expect(body).toContain("1:15");
    expect(body).toContain("記録されたイベント数: 2");
  });

  it("describes a draw when there's no winner", () => {
    const url = new URL(buildFeedbackIssueUrl(DRAW, EVENTS));
    const body = url.searchParams.get("body") ?? "";

    expect(body).toContain("引き分け");
  });

  it("omits the duration line when there were no recorded events", () => {
    const url = new URL(buildFeedbackIssueUrl(WIN, []));
    const body = url.searchParams.get("body") ?? "";

    expect(body).not.toContain("試合時間");
    expect(body).toContain("記録されたイベント数: 0");
  });
});
