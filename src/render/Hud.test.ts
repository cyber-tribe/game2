import { describe, expect, it } from "vitest";
import type { FactionSummary, GameOutcome, MatchEvent } from "../game/simulation";
import { Hud } from "./Hud";

const SUMMARIES: FactionSummary[] = [
  { id: "player", mana: 12.3, houses: 2, housesCap: 5, walkers: 1, behaviorMode: "settle" },
  { id: "enemy", mana: 4.5, houses: 1, housesCap: 5, walkers: 3, behaviorMode: "fight" },
];

const ONGOING: GameOutcome = { over: false };
const OVER: GameOutcome = { over: true, winner: "enemy" };

describe("Hud.update", () => {
  it("shows no match record while the game is still ongoing", () => {
    const hud = new Hud();
    hud.update(SUMMARIES, ONGOING, [{ time: 5, faction: "player", type: "earthquake" }]);

    expect(hud.view.text).not.toContain("戦いの記録");
    expect(hud.view.text).not.toContain("GAME OVER");
  });

  it("recaps every match event in order once the game is over, timestamped as m:ss", () => {
    const hud = new Hud();
    const events: MatchEvent[] = [
      { time: 8, faction: "player", type: "earthquake" },
      { time: 75, faction: "enemy", type: "volcano" },
      { time: 130, faction: "enemy", type: "armageddon" },
    ];

    hud.update(SUMMARIES, OVER, events);

    expect(hud.view.text).toContain("GAME OVER — enemy wins");
    expect(hud.view.text).toContain("戦いの記録:");
    const lines = hud.view.text.split("\n");
    expect(lines).toContain("0:08 💥 あなたが地震を起こした");
    expect(lines).toContain("1:15 🌋 敵が火山を起こした");
    expect(lines).toContain("2:10 ☠️ 敵が最終決戦を発動した");
    // Recap order follows event order, not some other sort.
    expect(lines.indexOf("0:08 💥 あなたが地震を起こした")).toBeLessThan(lines.indexOf("1:15 🌋 敵が火山を起こした"));
  });

  it("still shows the GAME OVER line and an empty recap when no miracle was ever cast", () => {
    const hud = new Hud();
    hud.update(SUMMARIES, OVER, []);

    expect(hud.view.text).toContain("GAME OVER — enemy wins");
    expect(hud.view.text).toContain("戦いの記録:");
  });
});
