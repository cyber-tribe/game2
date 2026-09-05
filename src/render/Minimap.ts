import { Container, Graphics } from "pixi.js";
import type { World } from "../ecs";
import { House, Owner, Position, Walker, type FactionId } from "../game/components";
import type { Heightmap } from "../world/heightmap";
import { GAME_PALETTE } from "./palette";

const FACTION_COLOR: Record<FactionId, number> = {
  player: 0x4fa8ff,
  enemy: 0xd94f4f,
};

const TERRAIN_COLOR: Record<Heightmap["terrain"], number> = {
  grass: 0x2f5c29,
  desert: 0x8a6b3a,
  snow: 0x8fa3aa,
  rock: 0x453a30,
};

const WATER_COLOR = 0x1e3f5c;

const HOUSE_DOT_SIZE = 3;
const WALKER_DOT_RADIUS = 1;

/**
 * How coarse the terrain-height readout is, independent of the actual
 * heightmap size (a 64x64 map's every vertex would be sub-pixel at this
 * minimap's own on-screen size anyway) — see terrainColorAt. Also caps the
 * number of fills the terrain layer needs regardless of map size.
 */
const TERRAIN_GRID_RESOLUTION = 24;
/** How many discrete brightness bands terrainColorAt quantizes elevation into — "数段階の明暗" per plan/0087, not a smooth gradient. */
const TERRAIN_HEIGHT_BANDS = 4;

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
 * The minimap's own per-cell terrain color: water where the sampled tile is
 * submerged, otherwise the terrain's base color shaded by one of
 * TERRAIN_HEIGHT_BANDS discrete brightness levels — low ground reads
 * darker, high ground lighter — so the map's actual shape is legible at a
 * glance instead of a single flat color, per plan/0087's "世界の地形が
 * ある程度読める縮小地図".
 */
function terrainColorAt(heightmap: Heightmap, tileX: number, tileY: number): number {
  const { vertices, waterLevel, terrain } = heightmap;
  const elevation = (vertices[tileY][tileX] + vertices[tileY][tileX + 1] + vertices[tileY + 1][tileX + 1] + vertices[tileY + 1][tileX]) / 4;
  if (elevation <= waterLevel) return WATER_COLOR;

  const maxElevation = Math.max(1, ...vertices.flat());
  const band = Math.min(TERRAIN_HEIGHT_BANDS - 1, Math.floor((elevation / maxElevation) * TERRAIN_HEIGHT_BANDS));
  const brightness = 0.55 + band * (0.6 / (TERRAIN_HEIGHT_BANDS - 1));
  return brightness < 1 ? lerpColor(TERRAIN_COLOR[terrain], 0x000000, 1 - brightness) : lerpColor(TERRAIN_COLOR[terrain], 0xffffff, brightness - 1);
}

/**
 * A small top-down overview of the whole map — docs/game-system.md's UI
 * section calls for exactly this: "世界儀（ミニマップ）：世界全体の
 * 俯瞰。クリックで視点移動". It was never actually built. That gap
 * matters more now that the enemy AI acts on its own (see
 * enemyMiracles.ts / enemyTerraform.ts): anything happening outside the
 * player's current pan/zoom is otherwise completely invisible until they
 * happen to scroll there.
 *
 * Deliberately simple — a low-res top-down grid, not a scaled-down
 * isometric render — since all it needs to convey is "where is
 * everything and roughly what shape the land is", not a faithful close-up
 * likeness.
 */
export class Minimap {
  readonly view = new Container();
  private readonly terrainLayer = new Graphics();
  private readonly entities = new Graphics();
  private readonly viewportIndicator = new Graphics();

  constructor(
    private readonly heightmap: Heightmap,
    readonly size: number,
  ) {
    const frame = new Graphics()
      .rect(-3, -3, size + 6, size + 6)
      .fill(GAME_PALETTE.bronzeDark)
      .rect(0, 0, size, size)
      .fill(GAME_PALETTE.stoneShadow);
    this.view.addChild(frame, this.terrainLayer, this.entities, this.viewportIndicator);
    this.redrawTerrain();
  }

  /** World (tile) coordinates for a tap at this minimap's own local coordinates. */
  toWorld(localX: number, localY: number): { x: number; y: number } {
    return {
      x: (localX / this.size) * this.heightmap.width,
      y: (localY / this.size) * this.heightmap.height,
    };
  }

  /**
   * Redraws the terrain-height grid. Call every frame alongside update()
   * (main.ts does), same as the entity dots — terrain can change anywhere
   * on the map, including well outside the player's current camera view
   * (the enemy AI's own terraforming/miracles), so there's no cheap,
   * always-correct way to detect "did anything change" from here the way
   * IsoRenderer's own redraw-skip does for the camera's visible bounds.
   * TERRAIN_GRID_RESOLUTION² fills, fixed regardless of the actual map
   * size, keeps that acceptable every-frame cost small.
   */
  redrawTerrain(): void {
    const g = this.terrainLayer;
    g.clear();
    const cellSize = this.size / TERRAIN_GRID_RESOLUTION;

    for (let gy = 0; gy < TERRAIN_GRID_RESOLUTION; gy++) {
      const tileY = Math.min(this.heightmap.height - 1, Math.floor((gy / TERRAIN_GRID_RESOLUTION) * this.heightmap.height));
      for (let gx = 0; gx < TERRAIN_GRID_RESOLUTION; gx++) {
        const tileX = Math.min(this.heightmap.width - 1, Math.floor((gx / TERRAIN_GRID_RESOLUTION) * this.heightmap.width));
        g.rect(gx * cellSize, gy * cellSize, cellSize, cellSize).fill(terrainColorAt(this.heightmap, tileX, tileY));
      }
    }
  }

  /** `visibleBounds` is the camera's current tile-space view (see main.ts's strictVisibleBounds) — drawn as an outline over the terrain grid. */
  update(world: World, visibleBounds?: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const g = this.entities;
    g.clear();

    for (const entity of world.query(Position, House, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const { x, y } = this.toMinimapPoint(pos);
      g.rect(x - HOUSE_DOT_SIZE / 2, y - HOUSE_DOT_SIZE / 2, HOUSE_DOT_SIZE, HOUSE_DOT_SIZE).fill(
        FACTION_COLOR[owner.faction],
      );
    }

    for (const entity of world.query(Position, Walker, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const { x, y } = this.toMinimapPoint(pos);
      g.circle(x, y, WALKER_DOT_RADIUS).fill(FACTION_COLOR[owner.faction]);
    }

    const vg = this.viewportIndicator;
    vg.clear();
    if (visibleBounds) {
      const topLeft = this.toMinimapPoint({ x: visibleBounds.minX, y: visibleBounds.minY });
      const bottomRight = this.toMinimapPoint({ x: visibleBounds.maxX + 1, y: visibleBounds.maxY + 1 });
      vg.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y).stroke({
        width: 1,
        color: GAME_PALETTE.parchment,
        alpha: 0.9,
      });
    }
  }

  private toMinimapPoint(pos: { x: number; y: number }): { x: number; y: number } {
    return {
      x: (pos.x / this.heightmap.width) * this.size,
      y: (pos.y / this.heightmap.height) * this.size,
    };
  }
}
