import { Container, Graphics } from "pixi.js";
import type { World } from "../ecs";
import { House, Owner, Position, Walker, type FactionId } from "../game/components";
import type { Heightmap } from "../world/heightmap";
import { GAME_PALETTE } from "./palette";

const FACTION_COLOR: Record<FactionId, number> = {
  player: 0x4fa8ff,
  enemy: 0xd94f4f,
};

/**
 * Darker than the main map's own TERRAIN_COLOR on purpose: the minimap
 * quantizes elevation into brightness bands on top of these (see
 * terrainColorAt), so its base tone has to leave headroom for the
 * brightest band without washing out. Hues follow the calibrated
 * GAME_PALETTE (see plan/archived/0088-palette-calibration.md) so the overview map
 * reads as the same world, just smaller.
 */
const TERRAIN_COLOR: Record<Heightmap["terrain"], number> = {
  grass: GAME_PALETTE.grassDark,
  desert: GAME_PALETTE.soilMid,
  snow: 0x8fa3aa,
  rock: GAME_PALETTE.stoneShadow,
};

const WATER_COLOR = GAME_PALETTE.waterDark;

/** Rock showing around the map on the island's top face, in px — see drawIsland. */
const ISLAND_RIM = 5;
/** How far the island's body drops below that face before the shards start. */
const ISLAND_DEPTH = 11;
/** How many shards trail into the void, and how far the longest reaches. */
const ISLAND_SHARD_COUNT = 7;
const ISLAND_SHARD_LENGTH = 18;

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

/**
 * The rock the overview map is set into — 「世界の縮小模型が岩盤ごと虚空に
 * 浮いている」.
 *
 * Not a border. The original does not frame its world map; it hangs a lump
 * of rock in the same black space the world itself hangs in and sets the
 * map into its top face. So this is drawn with a top surface, a body that
 * tapers away below it, and shards trailing off the underside — the same
 * three parts the world's own cut edge has (see IsoRenderer's EDGE_STRATA),
 * because it is meant to read as the same material.
 *
 * A flat rectangle with a stone-coloured stroke says "this is a UI panel".
 * Volume is what says "this is a piece of the world, shrunk".
 *
 * Drawn once at construction, deterministically: it is a fixture of the
 * screen, not something that should look different on each run.
 */
function drawIsland(size: number): Graphics {
  const g = new Graphics();
  const rim = ISLAND_RIM;
  const left = -rim;
  const right = size + rim;
  const top = -rim;
  const bottom = size + rim;

  // The body: the rim's footprint tapering down into the dark.
  const taper = (right - left) * 0.16;
  g.poly([left, bottom - 2, right, bottom - 2, right - taper, bottom + ISLAND_DEPTH, left + taper, bottom + ISLAND_DEPTH]).fill(
    GAME_PALETTE.soilMid,
  );
  g.poly([
    left + taper,
    bottom + ISLAND_DEPTH,
    right - taper,
    bottom + ISLAND_DEPTH,
    right - taper * 1.6,
    bottom + ISLAND_DEPTH * 1.7,
    left + taper * 1.6,
    bottom + ISLAND_DEPTH * 1.7,
  ]).fill(GAME_PALETTE.stoneShadow);

  // Shards hanging into the void, longest toward the middle.
  const shardTop = bottom + ISLAND_DEPTH * 1.7 - 1;
  for (let i = 0; i < ISLAND_SHARD_COUNT; i++) {
    const t = (i + 0.5) / ISLAND_SHARD_COUNT;
    const span = right - taper * 1.6 - (left + taper * 1.6);
    const x = left + taper * 1.6 + t * span;
    const half = span / ISLAND_SHARD_COUNT / 2;
    const length = ISLAND_SHARD_LENGTH * (0.4 + 0.6 * Math.sin(t * Math.PI)) * (i % 3 === 0 ? 0.65 : 1);
    g.poly([x - half, shardTop, x + half, shardTop, x, shardTop + length]).fill(
      i % 2 === 0 ? GAME_PALETTE.stoneShadow : GAME_PALETTE.soilDark,
    );
  }

  // The top face the map is set into: lit soil, with the near edge in
  // shadow so the surface reads as facing up rather than at the viewer.
  //
  // Chipped rather than rectangular. A clean rectangle around a map is a
  // picture frame however it is coloured; broken corners are what say the
  // map is set into a piece of ground that was torn out of somewhere.
  const chip = ISLAND_RIM * 1.6;
  g.poly([
    left + chip, top,
    right - chip * 0.6, top,
    right, top + chip * 0.7,
    right, bottom - chip,
    right - chip * 1.2, bottom,
    left + chip * 0.7, bottom,
    left, bottom - chip * 0.8,
    left, top + chip,
  ]).fill(GAME_PALETTE.soilLight);
  g.rect(left + chip * 0.7, bottom - 3, right - chip * 1.9, 3).fill(GAME_PALETTE.soilMid);
  // The socket the map sits in.
  g.rect(-1, -1, size + 2, size + 2).fill(GAME_PALETTE.stoneShadow);
  return g;
}

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
    this.view.addChild(drawIsland(size), this.terrainLayer, this.entities, this.viewportIndicator);
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
