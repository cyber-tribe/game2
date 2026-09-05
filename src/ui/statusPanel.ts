import type { FactionSummary } from "../game/simulation";
import { paintIcon } from "./pixelIcons";

/**
 * The command panel's status row — a pixel meter+icon+number combo for
 * mana, and a two-color pixel bar for the population comparison — replacing
 * the plain-text HUD line this project used to render ("player: mana 12.3
 * house 4 walker 2 (settle)"), per plan/0084-original-ui-foundation.md.
 * Only the player's own mana is shown: the original doesn't expose the
 * opponent's exact mana reserve, and showing it here was this prototype's
 * own debug convenience, not something to preserve for fidelity. Internal
 * entity/faction names ("player"/"enemy"/"walker"/"house") are deliberately
 * never rendered as text here — see index.html's status-row markup, which
 * carries no such labels at all.
 */
export class StatusPanel {
  private readonly manaFill: HTMLElement | null;
  private readonly manaValue: HTMLElement | null;
  private readonly populationPlayer: HTMLElement | null;
  private readonly populationEnemy: HTMLElement | null;

  constructor(private readonly maxMana: number) {
    this.manaFill = document.getElementById("mana-bar-fill");
    this.manaValue = document.getElementById("mana-value");
    this.populationPlayer = document.getElementById("population-bar-player");
    this.populationEnemy = document.getElementById("population-bar-enemy");

    const manaIcon = document.getElementById("mana-status-icon");
    if (manaIcon instanceof HTMLCanvasElement) paintIcon(manaIcon, "mana");
    const populationIcon = document.getElementById("population-status-icon");
    if (populationIcon instanceof HTMLCanvasElement) paintIcon(populationIcon, "population");
  }

  update(summaries: readonly FactionSummary[]): void {
    const player = summaries.find((s) => s.id === "player");
    const enemy = summaries.find((s) => s.id === "enemy");

    if (player) {
      const fraction = Math.max(0, Math.min(1, player.mana / this.maxMana));
      if (this.manaFill) this.manaFill.style.width = `${fraction * 100}%`;
      if (this.manaValue) this.manaValue.textContent = player.mana.toFixed(0);
    }

    const total = (player?.population ?? 0) + (enemy?.population ?? 0);
    const playerShare = total > 0 ? (player?.population ?? 0) / total : 0.5;
    if (this.populationPlayer) this.populationPlayer.style.width = `${playerShare * 100}%`;
    if (this.populationEnemy) this.populationEnemy.style.width = `${(1 - playerShare) * 100}%`;
  }
}
