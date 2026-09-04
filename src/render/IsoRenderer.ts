import { Container, Graphics } from "pixi.js";
import { sampleElevation, VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";

// Sized for finger taps rather than mouse clicks: at scale 1 adjacent
// vertices sit 32px/16px apart on screen, which pickVertex's default
// maxDistance is tuned around — see plan/archived/0009-pan-for-vertex-picking.md.
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
const ELEVATION_STEP = 16;

/**
 * Time constant (seconds) for how fast the on-screen terrain height eases
 * toward its real value after an edit — see `update()`. Small enough that
 * a single raise/lower tap still feels immediate (~3 time constants, or
 * ~150ms, to visually settle) rather than sluggish.
 */
const ELEVATION_EASE_TIME_CONSTANT = 0.05;

const TERRAIN_COLOR: Record<Heightmap["terrain"], number> = {
  grass: 0x4a8c3f,
  desert: 0xd6b25e,
  snow: 0xe8f0f5,
  rock: 0x6b5a4a,
};

const WATER_COLOR = 0x2a5f8c;

/**
 * Volcano rock (see applyVolcano/rockHardness) used to just render as
 * plain TERRAIN_COLOR.rock — indistinguishable from an ordinary rocky
 * hillside, with nothing to say "this used to be lava". These two colors
 * are the ends of a gradient (see volcanoTileColor) driven by how much
 * rockHardness is left: freshly erupted rock glows hot magma-orange, and
 * cools toward dark obsidian as raiseVertex chips its hardness down —
 * "頑張れば平地に戻せる" (see heightmap.ts's rockHardness doc comment)
 * becomes visible as the glow fading, not just a number.
 */
const VOLCANO_MAGMA_COLOR = 0xff5a1f;
const VOLCANO_COOLED_ROCK_COLOR = 0x352a24;

/** Linearly interpolates each RGB channel between two 0xRRGGBB colors. */
function lerpColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * clamped);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The fill color for a volcano rock tile, hottest (VOLCANO_MAGMA_COLOR) at
 * full rockHardness and coolest (VOLCANO_COOLED_ROCK_COLOR) as it
 * approaches 0. Pulled out as a pure function so the gradient itself is
 * unit-testable without needing a Graphics/canvas context.
 */
export function volcanoTileColor(hardness: number, maxHardness: number = VOLCANO_ROCK_HARDNESS): number {
  const t = maxHardness > 0 ? hardness / maxHardness : 0;
  return lerpColor(VOLCANO_COOLED_ROCK_COLOR, VOLCANO_MAGMA_COLOR, t);
}

/** Renders a heightmap as an isometric grid of quads, one per tile. */
export class IsoRenderer {
  readonly view = new Container();
  readonly heightmap: Heightmap;
  private readonly graphics = new Graphics();

  /**
   * The height actually drawn on screen for each vertex — separate from
   * heightmap.vertices (which stays the instantly-updated, authoritative
   * value every game-logic check reads: flatness, buildability, walker
   * footing). `update()` eases this toward heightmap.vertices each frame
   * so a raise/lower/earthquake/volcano visibly rises or falls instead of
   * snapping instantly, per the "terrain edits should feel good — this is
   * the operation a player touches most" feedback.
   */
  private displayVertices: number[][];

  constructor(heightmap: Heightmap) {
    this.heightmap = heightmap;
    this.displayVertices = heightmap.vertices.map((row) => [...row]);
    this.view.addChild(this.graphics);
    this.redraw();
  }

  /**
   * Eases displayVertices toward the real heightmap.vertices. Call once
   * per frame, before redraw(). Frame-rate independent: the fraction
   * covered per call depends only on deltaSeconds, not on how often this
   * runs.
   */
  update(deltaSeconds: number): void {
    const { vertices } = this.heightmap;
    const t = 1 - Math.exp(-deltaSeconds / ELEVATION_EASE_TIME_CONSTANT);

    for (let y = 0; y < this.displayVertices.length; y++) {
      const displayRow = this.displayVertices[y];
      const targetRow = vertices[y];
      for (let x = 0; x < displayRow.length; x++) {
        const delta = targetRow[x] - displayRow[x];
        displayRow[x] = Math.abs(delta) < 0.01 ? targetRow[x] : displayRow[x] + delta * t;
      }
    }
  }

  centerOn(screenWidth: number, screenHeight: number): void {
    this.view.position.set(screenWidth / 2, screenHeight / 3);
  }

  /** Total screen-space width/height (at scale 1) of the diamond the map projects to. */
  get mapPixelWidth(): number {
    return (this.heightmap.width + this.heightmap.height) * (TILE_WIDTH / 2);
  }

  get mapPixelHeight(): number {
    return (this.heightmap.width + this.heightmap.height) * (TILE_HEIGHT / 2);
  }

  /**
   * Projects a fractional tile-space point (e.g. a walker mid-stride
   * between vertices) to screen space, sitting on the interpolated
   * terrain surface below it.
   */
  project(x: number, y: number): { sx: number; sy: number } {
    return this.toScreen(x, y, sampleElevation(this.heightmap, x, y));
  }

  /**
   * Finds the grid vertex closest to a point in this.view's local space
   * (e.g. from `view.toLocal(pointerEvent.global)`), for turning a tap
   * into "which vertex did the player grab". `maxDistance` is in actual
   * screen pixels regardless of the view's current zoom (it's converted
   * to local-space units internally), so a finger's tap tolerance stays
   * constant even if the map is scaled down. Returns null past that
   * distance from every vertex.
   */
  pickVertex(localX: number, localY: number, maxDistance = 40): { x: number; y: number } | null {
    const { width, height, vertices } = this.heightmap;
    const localMaxDistance = maxDistance / this.view.scale.x;
    let best: { x: number; y: number } | null = null;
    let bestDistance = localMaxDistance;

    for (let y = 0; y <= height; y++) {
      for (let x = 0; x <= width; x++) {
        const { sx, sy } = this.toScreen(x, y, vertices[y][x]);
        const distance = Math.hypot(sx - localX, sy - localY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }

    return best;
  }

  /**
   * Rebuilds the terrain mesh from the current display heights (see
   * displayVertices) — call after editing the heightmap, and every frame
   * update() runs, so an in-progress ease keeps redrawing until it settles.
   */
  redraw(): void {
    const { width, height, rockHardness, waterLevel, terrain } = this.heightmap;
    const vertices = this.displayVertices;
    const graphics = this.graphics;
    graphics.clear();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nw = vertices[y][x];
        const ne = vertices[y][x + 1];
        const se = vertices[y + 1][x + 1];
        const sw = vertices[y + 1][x];
        const avgHeight = (nw + ne + se + sw) / 4;
        const cornerHardness = [
          rockHardness[y][x],
          rockHardness[y][x + 1],
          rockHardness[y + 1][x + 1],
          rockHardness[y + 1][x],
        ];
        const isRockTile = cornerHardness.some((h) => h > 0);
        const avgHardness = cornerHardness.reduce((sum, h) => sum + h, 0) / 4;

        const p0 = this.toScreen(x, y, nw);
        const p1 = this.toScreen(x + 1, y, ne);
        const p2 = this.toScreen(x + 1, y + 1, se);
        const p3 = this.toScreen(x, y + 1, sw);

        const color =
          avgHeight <= waterLevel ? WATER_COLOR : isRockTile ? volcanoTileColor(avgHardness) : TERRAIN_COLOR[terrain];
        // A warm glow along a fresh volcano tile's edges reads as heat;
        // ordinary tiles keep the plain, subtle grid outline.
        const strokeColor = isRockTile ? lerpColor(0x000000, VOLCANO_MAGMA_COLOR, avgHardness / VOLCANO_ROCK_HARDNESS) : 0x000000;
        const strokeAlpha = isRockTile ? 0.15 + 0.5 * (avgHardness / VOLCANO_ROCK_HARDNESS) : 0.15;

        graphics
          .poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
          .fill(color)
          .stroke({ width: 1, color: strokeColor, alpha: strokeAlpha });
      }
    }
  }

  private toScreen(x: number, y: number, elevation: number) {
    return {
      sx: (x - y) * (TILE_WIDTH / 2),
      sy: (x + y) * (TILE_HEIGHT / 2) - elevation * ELEVATION_STEP,
    };
  }
}
