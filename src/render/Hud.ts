import { Text } from "pixi.js";

/**
 * The world-info readout in the corner of the map — terrain type and any
 * active terrain-edit restriction. Controls live in the HTML command panel
 * (see src/ui/toolbar.ts), and per-faction mana/population now live in that
 * same panel's status row (see src/ui/statusPanel.ts) rather than here —
 * moved out per plan/0084-original-ui-foundation.md's "内部名称
 * （player/enemy/walker/house）をプレイヤー画面に出さない": this used to
 * render a raw "player: mana 12.3 house 4 walker 2 (settle)" debug-style
 * line, which is exactly what that effort targets. The post-game "GAME
 * OVER" banner moved out too — the #match-record HTML overlay already
 * announces the winner (in Japanese, with the full event recap) the same
 * frame the match ends, so this line was a redundant, debug-flavored
 * duplicate of that dialog rather than something a player needed here.
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
   * `viewport-fit=cover` — doesn't render the terrain label under the
   * status bar. A plain browser tab has no inset to speak of (its own
   * chrome already occupies that space), so this is a no-op there.
   */
  setTopInset(px: number): void {
    this.view.position.set(10, 10 + px);
  }

  /**
   * Sets the world's terrain type label (e.g. "草原"), shown once above
   * the terrain-edit-rule line. Terrain doesn't change mid-match, so this
   * is called once at startup rather than every update() — without it,
   * TERRAIN_GROWTH_MULTIPLIER's effect on growth speed is invisible to
   * the player.
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

  update(): void {
    this.view.text = [`地形: ${this.terrainLabel}`, ...(this.terrainEditRuleLabel ? [`地形操作: ${this.terrainEditRuleLabel}`] : [])].join("\n");
  }
}
