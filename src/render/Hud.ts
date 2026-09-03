import { Text } from "pixi.js";
import type { FactionSummary, GameOutcome } from "../game/simulation";

/**
 * Compact top status readout: each faction's mana/houses/walkers/mode,
 * plus the game-over banner. Controls themselves live in the HTML
 * toolbar (see src/ui/toolbar.ts) — this is read-only.
 */
export class Hud {
  readonly view: Text;

  constructor() {
    this.view = new Text({
      text: "",
      style: {
        fill: 0xffffff,
        fontSize: 12,
        fontFamily: "monospace",
        wordWrap: true,
        wordWrapWidth: 320,
        breakWords: true,
      },
    });
    this.view.position.set(10, 10);
  }

  /** Keeps status text from running off the edge of narrow phone screens. */
  setMaxWidth(width: number): void {
    this.view.style.wordWrapWidth = Math.max(120, width - 20);
  }

  update(summaries: FactionSummary[], outcome: GameOutcome): void {
    const lines = summaries.map(
      (s) => `${s.id}: mana ${s.mana.toFixed(1)} house ${s.houses} walker ${s.walkers} (${s.behaviorMode})`,
    );

    if (outcome.over) {
      lines.push("", outcome.winner ? `GAME OVER — ${outcome.winner} wins` : "GAME OVER — draw");
    }

    this.view.text = lines.join("\n");
  }
}
