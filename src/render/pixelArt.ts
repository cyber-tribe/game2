import type { Graphics } from "pixi.js";
import type { HouseLevel } from "../game/components";

/**
 * Fixed (non-faction) accent colors shared by every house's pixel art —
 * only the wall color changes per faction, so ownership stays readable
 * at a glance while every house still looks like an actual house instead
 * of a flat-colored square.
 */
const ROOF_COLOR = 0x5a4632;
const DOOR_COLOR = 0x2a1c10;
const WINDOW_COLOR = 0xaee0ff;

/**
 * A pixel-art pattern: one string per row, one character per column.
 * '.' is transparent; any other character is a palette key resolved via
 * the `palette` passed to drawPixelPattern. Rows need not be equal
 * length short of the widest row (shorter rows are just padded on read).
 */
type Pattern = readonly string[];
type Palette = Record<string, number>;

/**
 * Simple front-facing pixel person: a "W" (walker) pattern reusing a
 * single palette key, since — unlike a house — the whole body is one
 * color (faction, or KNIGHT_COLOR for a knighted leader).
 *
 * Two frames — feet together vs. feet apart — give a minimal walk cycle
 * (see EntityLayer's per-walker phase animation) instead of a single
 * frozen pose; per feedback that pixel art alone didn't yet read as
 * "alive", only as "no longer a plain circle".
 */
const WALKER_PATTERN_STAND: Pattern = [".WWW.", ".WWW.", ".WWW.", "WWWWW", ".WWW.", ".W.W.", ".W.W."];
const WALKER_PATTERN_STEP: Pattern = [".WWW.", ".WWW.", ".WWW.", "WWWWW", ".WWW.", "W...W", ".W.W."];

/**
 * One pattern per HouseLevel, each roughly matching that level's existing
 * on-screen footprint (see EntityLayer's HOUSE_SIZE) so upgrading a house
 * doesn't jump the map layout around. Bigger levels add windows, a wider
 * door, and (for castle) crenellations instead of a peaked roof — per
 * docs/game-system.md's "周囲の地形をさらに平らにすると自動でアップグ
 * レードされる", each level should visibly look like more of a building.
 */
const HOUSE_PATTERNS: Record<HouseLevel, Pattern> = {
  hut: ["..RRR..", ".RRRRR.", "RRRRRRR", "WWWWWWW", "WW.D.WW", "WWWWWWW"],
  lodge: ["..RRRR..", ".RRRRRR.", "RRRRRRRR", "WWWWWWWW", "WW.N..WW", "WW.D..WW", "WWWWWWWW"],
  manor: [
    "...RRR...",
    "..RRRRR..",
    ".RRRRRRR.",
    "RRRRRRRRR",
    "WWWWWWWWW",
    "WW.N.N.WW",
    "WW..D..WW",
    "WWWWWWWWW",
  ],
  castle: [
    "R.R.R.R.R.",
    "RRRRRRRRRR",
    "WWWWWWWWWW",
    "W.N.NN.N.W",
    "WWWWWWWWWW",
    "W.N....N.W",
    "WWWW..WWWW",
    "WW..DD..WW",
    "WW..DD..WW",
    "WWWWWWWWWW",
  ],
};

/** Target on-screen pixel width for each house level's pattern (see EntityLayer's HOUSE_SIZE). */
export const HOUSE_PATTERN_WIDTH: Record<HouseLevel, number> = { hut: 10, lodge: 14, manor: 18, castle: 24 };

/**
 * Draws a Pattern as a grid of filled squares ("pixels"), anchored so the
 * pattern's horizontal center sits at `centerX` and its bottom row sits
 * at `bottomY` — the same anchor EntityLayer already projects walkers/
 * houses onto (their ground point). `pixelSize` is derived by the caller
 * from the pattern's own width so every house level keeps roughly its
 * existing on-screen footprint regardless of how many columns its
 * pattern has.
 */
function drawPixelPattern(
  g: Graphics,
  pattern: Pattern,
  palette: Palette,
  centerX: number,
  bottomY: number,
  pixelSize: number,
): void {
  const cols = Math.max(...pattern.map((row) => row.length));
  const rows = pattern.length;
  const left = centerX - (cols * pixelSize) / 2;
  const top = bottomY - rows * pixelSize;

  for (let y = 0; y < rows; y++) {
    const row = pattern[y];
    for (let x = 0; x < cols; x++) {
      const key = row[x];
      if (!key || key === ".") continue;
      const color = palette[key];
      if (color === undefined) continue;
      g.rect(left + x * pixelSize, top + y * pixelSize, pixelSize, pixelSize).fill(color);
    }
  }
}

/**
 * Draws a pixel-art walker (a small person) instead of a plain circle.
 * `color` is the faction color, or KNIGHT_COLOR for a knighted walker —
 * the whole body is one color, so ownership/state reads the same way a
 * flat circle did, just shaped like a person now. `stepping` picks
 * between the two walk-cycle frames (see WALKER_PATTERN_STAND/_STEP);
 * EntityLayer alternates it over time so the sprite is never frozen.
 */
export function drawWalkerSprite(
  g: Graphics,
  centerX: number,
  groundY: number,
  color: number,
  scale: number,
  stepping: boolean,
): void {
  drawPixelPattern(g, stepping ? WALKER_PATTERN_STEP : WALKER_PATTERN_STAND, { W: color }, centerX, groundY, scale);
}

/**
 * Draws a pixel-art house instead of a plain square: a faction-colored
 * body with a fixed roof/door/window accent, sized to roughly match the
 * level's previous flat-square footprint (HOUSE_PATTERN_WIDTH).
 */
export function drawHouseSprite(g: Graphics, centerX: number, groundY: number, level: HouseLevel, wallColor: number): void {
  const pattern = HOUSE_PATTERNS[level];
  const cols = Math.max(...pattern.map((row) => row.length));
  const pixelSize = HOUSE_PATTERN_WIDTH[level] / cols;
  const palette: Palette = { W: wallColor, R: ROOF_COLOR, D: DOOR_COLOR, N: WINDOW_COLOR };

  drawPixelPattern(g, pattern, palette, centerX, groundY, pixelSize);
}
