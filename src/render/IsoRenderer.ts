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

  constructor(heightmap: Heightmap) {
    this.heightmap = heightmap;
    this.draw();
  }

  centerOn(screenWidth: number, screenHeight: number): void {
    this.view.position.set(screenWidth / 2, screenHeight / 3);
  }

  private toScreen(x: number, y: number, elevation: number) {
    return {
      sx: (x - y) * (TILE_WIDTH / 2),
      sy: (x + y) * (TILE_HEIGHT / 2) - elevation * ELEVATION_STEP,
    };
  }

  private draw(): void {
    const { width, height, vertices, terrain } = this.heightmap;
    const graphics = new Graphics();

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

    this.view.addChild(graphics);
  }
}
