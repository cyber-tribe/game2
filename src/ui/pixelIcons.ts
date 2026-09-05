import { GAME_PALETTE } from "../render/palette";

/**
 * Every command the toolbar needs an icon for — replaces the emoji this
 * project used to lean on (🌋🌊⚔️☠️🔍💥🚩🐸🛡️🚶), which read as OS-native
 * glyphs sitting on top of a pixel-art world rather than part of it (see
 * plan/0084-original-ui-foundation.md).
 */
export type IconKind =
  | "raise"
  | "lower"
  | "flatten"
  | "shrine"
  | "earthquake"
  | "swamp"
  | "knight"
  | "guardian"
  | "volcano"
  | "flood"
  | "armageddon"
  | "inspect"
  | "settle"
  | "gather"
  | "goToShrine"
  | "fight"
  | "releasePopulation"
  | "mana"
  | "population";

/** Logical icon resolution — small enough to read as a single "sprite" at 16-bit scale, per plan/0084's pixel-density notes. */
export const ICON_SIZE = 16;

type Grid = (number | undefined)[][];

function makeGrid(): Grid {
  return Array.from({ length: ICON_SIZE }, () => Array<number | undefined>(ICON_SIZE).fill(undefined));
}

function setPixel(grid: Grid, x: number, y: number, color: number): void {
  if (x >= 0 && x < ICON_SIZE && y >= 0 && y < ICON_SIZE) grid[y][x] = color;
}

function fillRect(grid: Grid, x: number, y: number, w: number, h: number, color: number): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) setPixel(grid, x + dx, y + dy, color);
}

function fillCircle(grid: Grid, cx: number, cy: number, r: number, color: number): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + 0.5) setPixel(grid, cx + x, cy + y, color);
    }
  }
}

/** Bresenham's line, optionally thickened by stamping a small square at each step. */
function drawLine(grid: Grid, x0: number, y0: number, x1: number, y1: number, color: number, thickness = 1): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const half = Math.floor(thickness / 2);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (thickness <= 1) setPixel(grid, x, y, color);
    else fillRect(grid, x - half, y - half, thickness, thickness, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * A triangular mountain silhouette shaded left-light/right-dark — the same
 * fixed-light-source convention IsoRenderer's own terrain triangles use
 * (see fillTerrainTriangle), so raise/lower/volcano read as small versions
 * of the terrain they act on rather than an unrelated glyph style.
 */
function fillMountain(grid: Grid, apexX: number, apexY: number, baseY: number, halfWidth: number, lightColor: number, darkColor: number): void {
  for (let y = apexY; y <= baseY; y++) {
    const t = (y - apexY) / Math.max(1, baseY - apexY);
    const hw = Math.round(t * halfWidth);
    fillRect(grid, apexX - hw, y, hw + 1, 1, lightColor);
    fillRect(grid, apexX, y, hw + 1, 1, darkColor);
  }
}

const P = GAME_PALETTE;

const ICON_BUILDERS: Record<IconKind, (grid: Grid) => void> = {
  raise: (grid) => {
    fillMountain(grid, 8, 2, 13, 6, P.stoneLight, P.stoneDark);
  },
  lower: (grid) => {
    // Same mountain, flipped vertically — a basin/pit rather than a peak.
    for (let y = 2; y <= 13; y++) {
      const t = (13 - y) / 11;
      const hw = Math.round(t * 6);
      fillRect(grid, 8 - hw, y, hw + 1, 1, P.stoneDark);
      fillRect(grid, 8, y, hw + 1, 1, P.stoneMid);
    }
    fillRect(grid, 6, 12, 4, 1, P.stoneShadow);
  },
  flatten: (grid) => {
    fillRect(grid, 2, 9, 6, 4, P.stoneLight);
    fillRect(grid, 8, 9, 6, 4, P.stoneMid);
    fillRect(grid, 2, 8, 12, 1, P.parchment);
    fillRect(grid, 2, 12, 12, 1, P.stoneShadow);
  },
  shrine: (grid) => {
    drawLine(grid, 8, 2, 8, 13, P.bronzeDark, 1);
    fillRect(grid, 9, 2, 4, 1, P.bronzeLight);
    fillRect(grid, 9, 3, 3, 1, P.bronzeLight);
    fillRect(grid, 9, 4, 2, 1, P.bronzeLight);
    fillRect(grid, 6, 13, 5, 1, P.stoneShadow);
  },
  earthquake: (grid) => {
    fillRect(grid, 1, 9, 14, 4, P.soilMid);
    fillRect(grid, 1, 8, 14, 1, P.soilLight);
    drawLine(grid, 3, 6, 6, 9, P.stoneShadow, 1);
    drawLine(grid, 6, 9, 5, 12, P.stoneShadow, 1);
    drawLine(grid, 9, 6, 8, 9, P.ink, 1);
    drawLine(grid, 8, 9, 11, 13, P.ink, 1);
  },
  swamp: (grid) => {
    fillCircle(grid, 8, 9, 6, P.soilDark);
    fillCircle(grid, 5, 7, 2, P.ink);
    fillCircle(grid, 10, 11, 1, P.ink);
    fillCircle(grid, 11, 6, 1, P.grassDark);
    fillCircle(grid, 4, 11, 1, P.grassDark);
  },
  knight: (grid) => {
    drawLine(grid, 8, 2, 8, 11, P.stoneLight, 1);
    fillRect(grid, 6, 5, 5, 1, P.bronzeMid);
    fillRect(grid, 7, 11, 3, 3, P.bronzeDark);
  },
  guardian: (grid) => {
    fillRect(grid, 4, 3, 9, 6, P.bronzeMid);
    fillMountain(grid, 8, 9, 13, 4, P.bronzeMid, P.bronzeDark);
    fillRect(grid, 4, 3, 4, 6, P.bronzeLight);
    fillRect(grid, 7, 4, 3, 4, P.stoneShadow);
  },
  volcano: (grid) => {
    fillMountain(grid, 8, 4, 13, 6, P.stoneDark, P.stoneShadow);
    fillRect(grid, 6, 4, 5, 2, P.lavaMid);
    fillRect(grid, 7, 3, 2, 1, P.lavaBright);
    fillRect(grid, 5, 1, 1, 2, P.lavaBright);
    fillRect(grid, 9, 0, 1, 2, P.lavaMid);
  },
  flood: (grid) => {
    for (let row = 0; row < 3; row++) {
      const y = 5 + row * 3;
      const offset = row % 2 === 0 ? 0 : 2;
      for (let x = 1; x < 15; x += 4) {
        fillRect(grid, x + offset, y, 3, 1, row % 2 === 0 ? P.waterLight : P.waterMid);
      }
    }
    fillRect(grid, 0, 13, 16, 2, P.waterDark);
  },
  armageddon: (grid) => {
    drawLine(grid, 3, 3, 13, 13, P.stoneLight, 1);
    drawLine(grid, 13, 3, 3, 13, P.stoneLight, 1);
    fillRect(grid, 3, 3, 2, 2, P.bronzeDark);
    fillRect(grid, 11, 3, 2, 2, P.bronzeDark);
    fillRect(grid, 3, 11, 2, 2, P.bronzeDark);
    fillRect(grid, 11, 11, 2, 2, P.bronzeDark);
    fillRect(grid, 7, 7, 2, 2, P.lavaBright);
  },
  inspect: (grid) => {
    fillCircle(grid, 6, 6, 4, P.bronzeLight);
    fillCircle(grid, 6, 6, 2, P.waterLight);
    drawLine(grid, 9, 9, 13, 13, P.bronzeDark, 2);
  },
  settle: (grid) => {
    fillMountain(grid, 8, 3, 8, 6, P.bronzeLight, P.bronzeMid);
    fillRect(grid, 3, 8, 10, 5, P.stoneMid);
    fillRect(grid, 3, 8, 5, 5, P.stoneLight);
    fillRect(grid, 7, 10, 2, 3, P.ink);
  },
  gather: (grid) => {
    fillRect(grid, 7, 7, 2, 2, P.bronzeLight);
    fillCircle(grid, 3, 3, 1, P.stoneLight);
    fillCircle(grid, 13, 3, 1, P.stoneLight);
    fillCircle(grid, 3, 13, 1, P.stoneLight);
    fillCircle(grid, 13, 13, 1, P.stoneLight);
    drawLine(grid, 4, 4, 7, 7, P.stoneMid, 1);
    drawLine(grid, 12, 4, 9, 7, P.stoneMid, 1);
    drawLine(grid, 4, 12, 7, 9, P.stoneMid, 1);
    drawLine(grid, 12, 12, 9, 9, P.stoneMid, 1);
  },
  goToShrine: (grid) => {
    drawLine(grid, 5, 2, 5, 10, P.bronzeDark, 1);
    fillRect(grid, 6, 2, 4, 1, P.bronzeLight);
    fillRect(grid, 6, 3, 3, 1, P.bronzeLight);
    fillRect(grid, 6, 4, 2, 1, P.bronzeLight);
    drawLine(grid, 8, 12, 13, 12, P.stoneLight, 1);
    fillRect(grid, 11, 11, 2, 1, P.stoneLight);
    fillRect(grid, 11, 13, 2, 1, P.stoneLight);
  },
  fight: (grid) => {
    drawLine(grid, 3, 12, 8, 7, P.stoneLight, 1);
    drawLine(grid, 13, 12, 8, 7, P.stoneLight, 1);
    fillRect(grid, 7, 6, 2, 2, P.lavaBright);
  },
  releasePopulation: (grid) => {
    fillCircle(grid, 6, 4, 2, P.parchment);
    fillRect(grid, 5, 6, 2, 5, P.ink);
    drawLine(grid, 5, 11, 4, 13, P.ink, 1);
    drawLine(grid, 6, 11, 7, 13, P.ink, 1);
    drawLine(grid, 9, 8, 13, 8, P.bronzeMid, 1);
    fillRect(grid, 11, 7, 2, 1, P.bronzeMid);
    fillRect(grid, 11, 9, 2, 1, P.bronzeMid);
  },
  mana: (grid) => {
    fillCircle(grid, 8, 8, 6, P.bronzeDark);
    fillCircle(grid, 8, 7, 5, P.manaAccent);
    fillCircle(grid, 6, 5, 2, P.manaHighlight);
  },
  population: (grid) => {
    fillCircle(grid, 5, 5, 2, P.parchment);
    fillRect(grid, 4, 7, 2, 4, P.ink);
    fillCircle(grid, 11, 6, 2, P.parchment);
    fillRect(grid, 10, 8, 2, 4, P.inkFaded);
  },
};

/** Builds the 16x16 pixel grid for a given command icon — exported mainly for testing. */
export function buildIconGrid(kind: IconKind): Grid {
  const grid = makeGrid();
  ICON_BUILDERS[kind](grid);
  return grid;
}

/**
 * Paints an icon onto an existing <canvas> (sized to ICON_SIZE, so it
 * scales crisply — see index.html's `image-rendering: pixelated`), rather
 * than the smooth vector look plan/0084 explicitly moves away from. Shared
 * by createIconCanvas (a fresh canvas per command button) and callers that
 * already have a fixed placeholder <canvas> in the DOM to paint into (the
 * status row's mana/population icons).
 */
export function paintIcon(canvas: HTMLCanvasElement, kind: IconKind): void {
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d")!;
  const grid = buildIconGrid(kind);
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const color = grid[y][x];
      if (color === undefined) continue;
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Renders an icon onto a freshly created <canvas> — see paintIcon. */
export function createIconCanvas(kind: IconKind): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "pixel-icon";
  paintIcon(canvas, kind);
  return canvas;
}
