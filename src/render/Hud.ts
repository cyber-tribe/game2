import { Text } from "pixi.js";
import type { FactionSummary } from "../game/simulation";

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

  update(summaries: FactionSummary[]): void {
    this.view.text = summaries
      .map((s) => `${s.id}: mana ${s.mana.toFixed(1)}  houses ${s.houses}  walkers ${s.walkers}`)
      .join("\n");
  }
}
