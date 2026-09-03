import { Text } from "pixi.js";
import type { FactionSummary, GameOutcome } from "../game/simulation";

/** Simple top-left text overlay showing each faction's mana/houses/walkers. */
export class Hud {
  readonly view: Text;

  constructor() {
    this.view = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 14, fontFamily: "monospace" },
    });
    this.view.position.set(12, 12);
  }

  update(summaries: FactionSummary[], outcome: GameOutcome): void {
    const lines = summaries.map(
      (s) =>
        `${s.id}: mana ${s.mana.toFixed(1)}  houses ${s.houses}  walkers ${s.walkers}  mode ${s.behaviorMode}`,
    );
    lines.push("", "[1] settle  [2] gather  [3] fight — set your behavior mode");

    if (outcome.over) {
      lines.push("", outcome.winner ? `GAME OVER — ${outcome.winner} wins` : "GAME OVER — draw");
    }

    this.view.text = lines.join("\n");
  }
}
