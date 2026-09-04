import { Text } from "pixi.js";
import type { FactionSummary, GameOutcome } from "../game/simulation";

/**
 * Compact top status readout: each faction's mana/houses/walkers/mode,
 * plus the game-over banner. Controls themselves live in the HTML
 * toolbar (see src/ui/toolbar.ts) — this is read-only. The post-game
 * "戦いの記録" recap lives in an HTML overlay instead (see main.ts's
 * #match-record), not here — it needs to scroll for a long match, which
 * a PixiJS Text object can't do on its own.
 */
export class Hud {
  readonly view: Text;
  private terrainLabel = "";
  private terrainEditRuleLabel = "";

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

  /**
   * Sets the world's terrain type label (e.g. "草原"), shown once above
   * the per-faction lines. Terrain doesn't change mid-match, so this is
   * called once at startup rather than every update() like the rest of
   * the HUD — without it, TERRAIN_GROWTH_MULTIPLIER's effect on growth
   * speed is invisible to the player.
   */
  setTerrain(label: string): void {
    this.terrainLabel = label;
  }

  /**
   * Sets the match's terrain-edit-rule label (e.g. "隆起のみ可"), shown
   * right below the terrain line — but only when given a non-empty label.
   * main.ts only calls this for a restrictive TerrainEditRule (see
   * world/heightmap.ts): the ordinary "both directions allowed" case is
   * left unset so most matches' HUD looks exactly as it did before this
   * existed. Without this line, a restricted match would look identical
   * to a normal one right up until a raise/lower tap mysteriously does
   * nothing — this is what tells the player *why*.
   */
  setTerrainEditRule(label: string): void {
    this.terrainEditRuleLabel = label;
  }

  update(summaries: FactionSummary[], outcome: GameOutcome): void {
    const lines = [
      `地形: ${this.terrainLabel}`,
      ...(this.terrainEditRuleLabel ? [`地形操作: ${this.terrainEditRuleLabel}`] : []),
      ...summaries.map((s) => {
        const houseText = s.houses >= s.housesCap ? `house ${s.houses}/${s.housesCap}（上限）` : `house ${s.houses}`;
        return `${s.id}: mana ${s.mana.toFixed(1)} ${houseText} walker ${s.walkers} (${s.behaviorMode})`;
      }),
      ...populationComparisonLines(summaries),
    ];

    if (outcome.over) {
      lines.push("", outcome.winner ? `GAME OVER — ${outcome.winner} wins` : "GAME OVER — draw");
    }

    this.view.text = lines.join("\n");
  }
}

/** Width (in characters) of the population-comparison bar below. */
const POPULATION_BAR_WIDTH = 10;

/**
 * A compact "who's ahead" bar — docs/game-system.md's 情報パネル describes
 * a "両陣営の総人口の比較表示". Hud is a single PIXI.Text with one fill
 * color, so the two factions' shares are shown as filled vs. empty blocks
 * rather than two colors.
 */
function populationBar(player: number, enemy: number): string {
  const total = player + enemy;
  if (total <= 0) return "░".repeat(POPULATION_BAR_WIDTH);
  const filled = Math.round((player / total) * POPULATION_BAR_WIDTH);
  return "▓".repeat(filled) + "░".repeat(POPULATION_BAR_WIDTH - filled);
}

/**
 * Omitted entirely if either faction is missing from the summary (should
 * only happen in tests that pass a partial fixture) — this game always
 * has exactly a "player" and an "enemy" faction (see FactionId), each
 * still summarized after losing (see Simulation.summarize).
 */
function populationComparisonLines(summaries: FactionSummary[]): string[] {
  const player = summaries.find((s) => s.id === "player");
  const enemy = summaries.find((s) => s.id === "enemy");
  if (!player || !enemy) return [];

  const bar = populationBar(player.population, enemy.population);
  return [`人口 [${bar}] player ${Math.round(player.population)} : enemy ${Math.round(enemy.population)}`];
}
