import { describe, expect, it } from "vitest";
import type { FactionSummary, GameOutcome } from "../game/simulation";
import { Hud } from "./Hud";

const SUMMARIES: FactionSummary[] = [
  { id: "player", mana: 12.3, houses: 2, housesCap: 5, walkers: 1, behaviorMode: "settle" },
  { id: "enemy", mana: 4.5, houses: 1, housesCap: 5, walkers: 3, behaviorMode: "fight" },
];

const ONGOING: GameOutcome = { over: false };
const OVER: GameOutcome = { over: true, winner: "enemy" };

describe("Hud.update", () => {
  it("shows no GAME OVER line while the game is still ongoing", () => {
    const hud = new Hud();
    hud.update(SUMMARIES, ONGOING);

    expect(hud.view.text).not.toContain("GAME OVER");
  });

  it("shows the GAME OVER line with the winner once the game is over", () => {
    const hud = new Hud();
    hud.update(SUMMARIES, OVER);

    expect(hud.view.text).toContain("GAME OVER — enemy wins");
  });

  it("shows a draw when the outcome has no winner", () => {
    const hud = new Hud();
    hud.update(SUMMARIES, { over: true });

    expect(hud.view.text).toContain("GAME OVER — draw");
  });
});
