import { GAME_PALETTE } from "../render/palette";
import { ditherPixelHash } from "../render/patternTexture";

/**
 * 雷文 — the Greek key the original runs along the edge of its command
 * slabs, drawn as one tileable unit.
 *
 * Written as literal pixels for the same reason the command icons are (see
 * tools/sprites/icons.py): at 8px a pattern *is* its pixels, so the art and
 * the review artifact are the same thing. Read as a single line: it comes
 * in along the bottom rail, turns up the second column, runs right along
 * the top, and spirals inward — the classic running meander, one full turn
 * per unit.
 *
 * The bottom row is solid, and that is what makes it tile: the rail leaves
 * the right edge exactly where the next unit's rail begins, so a repeated
 * strip reads as one continuous band rather than a row of separate stamps.
 */
export const MEANDER_PATTERN: readonly string[] = [
  "........",
  ".######.",
  ".#....#.",
  ".#.##.#.",
  ".#.#..#.",
  ".#.####.",
  ".#......",
  "########",
];

export const MEANDER_SIZE = MEANDER_PATTERN.length;

/** The slab grain's repeat, in px — see STONE_SIZE. */
export const STONE_GRAIN_SIZE_PX = 32;

/** How much of the slab's face is flecked rather than flat — see createStoneDataUrl. */
const STONE_FLECK_DENSITY = 0.07;
/**
 * One repeat of the slab's own grain, in px.
 *
 * Large. A small repeat is the whole failure mode here: at 7px the flecks
 * stopped reading as grain and started reading as a woven grid, because the
 * eye finds the period long before it finds the texture. Stone has no
 * period, so the repeat has to be big enough that the panel's own width
 * never shows it twice in one glance.
 */
const STONE_SIZE = STONE_GRAIN_SIZE_PX;

function toDataUrl(width: number, height: number, colorAt: (x: number, y: number) => string): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      context.fillStyle = colorAt(x, y);
      context.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL();
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * The meander band, as a CSS-ready data URL: ink on the panel's own light
 * stone, so the band reads as carved into the slab rather than laid on top
 * of it.
 */
export function createMeanderDataUrl(): string {
  const line = hex(GAME_PALETTE.stoneShadow);
  const ground = hex(GAME_PALETTE.stoneLight);
  return toDataUrl(MEANDER_SIZE, MEANDER_SIZE, (x, y) => (MEANDER_PATTERN[y][x] === "#" ? line : ground));
}

/**
 * The slab's face: the panel's own mid stone, flecked with the tone just
 * above and below it.
 *
 * A flat fill of one colour reads as a painted UI surface at any size. Real
 * stone is never one value, and the original's panels are visibly grainy —
 * this is the same argument the terrain's own turf makes (see
 * render/patternTexture.ts), applied to the thing the terrain sits under.
 * Kept deliberately faint, and on a large repeat: the panel is a background
 * for icons and text, and grain loud enough to notice on its own would be
 * grain loud enough to read through.
 */
export type StoneTone = "base" | "pit" | "grit";

/**
 * Which of the slab's three tones a pixel takes — pulled out of the canvas
 * work so the grain can be checked without a DOM.
 *
 * Half as many lifted specks as pitted ones: the original's slabs read as
 * worn rather than sparkling.
 */
export function stoneToneAt(x: number, y: number): StoneTone {
  const roll = ditherPixelHash(x, y);
  if (roll < STONE_FLECK_DENSITY) return "pit";
  if (roll > 1 - STONE_FLECK_DENSITY / 2) return "grit";
  return "base";
}

export function createStoneDataUrl(): string {
  const tone: Record<StoneTone, string> = {
    base: hex(GAME_PALETTE.stoneMid),
    pit: hex(GAME_PALETTE.stoneDark),
    grit: hex(GAME_PALETTE.stoneLight),
  };
  return toDataUrl(STONE_SIZE, STONE_SIZE, (x, y) => tone[stoneToneAt(x, y)]);
}

/**
 * Paints the command panel's carved-stone surfaces, as CSS custom
 * properties the stylesheet then places (see index.html).
 *
 * Built here rather than shipped as image files for the same reason the
 * command icons are generated: the colours come from GAME_PALETTE, so a
 * palette pass moves the panel with everything else instead of leaving a
 * stale PNG behind.
 */
export function mountPanelFrame(): void {
  const root = document.documentElement;
  root.style.setProperty("--meander-image", `url("${createMeanderDataUrl()}")`);
  root.style.setProperty("--meander-size", `${MEANDER_SIZE}px`);
  root.style.setProperty("--stone-grain-image", `url("${createStoneDataUrl()}")`);
  root.style.setProperty("--stone-grain-size", `${STONE_SIZE}px`);
}
