import { Container, Graphics } from "pixi.js";
import type { Heightmap } from "../world/heightmap";

const TILE_WIDTH = 48;
const TILE_HEIGHT = 24;
const ELEVATION_STEP = 12;

const TERRAIN_COLOR: Record<Heightmap["terrain"], number> = {
  grass: 0x4a8c3f,
  desert: 0xd6b25e,
  snow: 0xe8f0f5,
  rock: 0x6b5a4a,
};

const WATER_COLOR = 0x2a5f8c;

/** Renders a heightmap as an isometric grid of quads, one per tile. */
export class IsoRenderer {
  readonly view = new Container();
  private readonly heightmap: Heightmap;
  private readonly graphics = new Graphics();

  constructor(heightmap: Heightmap) {
    this.heightmap = heightmap;
    this.view.addChild(this.graphics);
    this.redraw();
  }

  centerOn(screenWidth: number, screenHeight: number): void {
    this.view.position.set(screenWidth / 2, screenHeight / 3);
  }

  /**
   * Projects a fractional tile-space point (e.g. a walker mid-stride
   * between vertices) to screen space, sitting on the interpolated
   * terrain surface below it.
   */
  project(x: number, y: number): { sx: number; sy: number } {
    return this.toScreen(x, y, this.sampleElevation(x, y));
  }

  /**
   * Finds the grid vertex closest to a point in this.view's local space
   * (e.g. from `view.toLocal(pointerEvent.global)`), for turning a click
   * into "which vertex did the player grab". Returns null past
   * maxDistance screen pixels from every vertex.
   */
  pickVertex(localX: number, localY: number, maxDistance = 16): { x: number; y: number } | null {
    const { width, height, vertices } = this.heightmap;
    let best: { x: number; y: number } | null = null;
    let bestDistance = maxDistance;

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

  /** Rebuilds the terrain mesh from the current heightmap. Call after editing it. */
  redraw(): void {
    const { width, height, vertices, terrain } = this.heightmap;
    const graphics = this.graphics;
    graphics.clear();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nw = vertices[y][x];
        const ne = vertices[y][x + 1];
        const se = vertices[y + 1][x + 1];
        const sw = vertices[y + 1][x];
        const avgHeight = (nw + ne + se + sw) / 4;

        const p0 = this.toScreen(x, y, nw);
        const p1 = this.toScreen(x + 1, y, ne);
        const p2 = this.toScreen(x + 1, y + 1, se);
        const p3 = this.toScreen(x, y + 1, sw);

        const color = avgHeight <= 0 ? WATER_COLOR : TERRAIN_COLOR[terrain];

        graphics
          .poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
          .fill(color)
          .stroke({ width: 1, color: 0x000000, alpha: 0.15 });
      }
    }
  }

  private toScreen(x: number, y: number, elevation: number) {
    return {
      sx: (x - y) * (TILE_WIDTH / 2),
      sy: (x + y) * (TILE_HEIGHT / 2) - elevation * ELEVATION_STEP,
    };
  }

  private sampleElevation(x: number, y: number): number {
    const { width, height, vertices } = this.heightmap;
    const cx = Math.min(Math.max(x, 0), width);
    const cy = Math.min(Math.max(y, 0), height);
    const x0 = Math.min(Math.floor(cx), width - 1);
    const y0 = Math.min(Math.floor(cy), height - 1);
    const tx = cx - x0;
    const ty = cy - y0;

    const h00 = vertices[y0][x0];
    const h10 = vertices[y0][x0 + 1];
    const h01 = vertices[y0 + 1][x0];
    const h11 = vertices[y0 + 1][x0 + 1];

    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;
    return top + (bottom - top) * ty;
  }
}
