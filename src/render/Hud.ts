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

  /**
   * Pushes the HUD down by the device's top safe-area inset (notch/status
   * bar), so an installed standalone PWA — which draws edge-to-edge under
   * `viewport-fit=cover` — doesn't render mana/house/walker text under the
   * status bar. A plain browser tab has no inset to speak of (its own
   * chrome already occupies that space), so this is a no-op there.
   */
  setTopInset(px: number): void {
    this.view.position.set(10, 10 + px);
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
