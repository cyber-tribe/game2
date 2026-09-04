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
 * hillside, with nothing to say "this used to be lava". Real volcano
 * depictions (Terraria's Underworld, Stardew Valley's Volcano Dungeon,
 * SimCity/RCT's disaster volcanoes, Minecraft's lava) consistently use the
 * same pattern: the rock itself stays dark and solid — obsidian, ash,
 * charcoal — and the "fire" reads entirely from small, bright, separately
 * colored lava glowing in cracks/pools against that dark base, not from
 * tinting the whole mass orange. A single hardness→orange gradient across
 * the *entire* tile (the previous approach here) just reads as a brown or
 * orange mountain, because nothing in it looks dark enough to contrast
 * against. So the base fill here is always dark rock; the lava is drawn
 * separately in redraw() as glowing cracks radiating from each tile's
 * center, sized/brightened by rockHardness and gently pulsing over time
 * (see volcanoGlowIntensity/drawLavaCracks) — cooling toward nothing as
 * raiseVertex chips rockHardness down, per "頑張れば平地に戻せる"
 * (heightmap.ts's rockHardness doc comment).
 */
const VOLCANO_ROCK_COLOR = 0x1a120f;
const LAVA_CORE_COLOR = 0xfff4c2;
const LAVA_GLOW_COLOR = 0xff5a12;
/** Radians/second the lava glow's pulse advances — see volcanoGlowIntensity. */
const LAVA_PULSE_SPEED = 3;
/** How much the pulse swings the glow up/down around its hardness-driven base level. */
const LAVA_PULSE_DEPTH = 0.25;
/**
 * Floor under a crack's opacity once there's any glow at all, so it still
 * reads as visibly lit rather than fading to near-invisible thin lines —
 * only the count/length of cracks should really telegraph "almost cooled",
 * not their opacity dropping to nothing.
 */
const LAVA_MIN_ALPHA = 0.45;

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
 * Deterministic pseudo-random value in [0, 1) for a tile's (x, y) — used to
 * give each volcano tile its own fixed crack angles and pulse phase, so
 * they don't all flicker in unison or reshuffle every frame. Same trick as
 * EntityLayer's walkCycle (a hash of position, not real randomness).
 */
function tileHash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * How brightly a volcano tile's lava should glow right now: a base level
 * from how much rockHardness is left (0 once it's fully cooled back to
 * ordinary ground), gently pulsing over time like real embers rather than
 * sitting at a flat brightness. Pulled out as a pure function so both the
 * hardness falloff and the pulse are unit-testable without a Graphics/
 * canvas context.
 */
export function volcanoGlowIntensity(
  hardness: number,
  maxHardness: number,
  elapsedTime: number,
  phaseSeed: number,
): number {
  const base = maxHardness > 0 ? Math.max(0, Math.min(1, hardness / maxHardness)) : 0;
  const pulse = 1 - LAVA_PULSE_DEPTH + LAVA_PULSE_DEPTH * Math.sin(elapsedTime * LAVA_PULSE_SPEED + phaseSeed * Math.PI * 2);
  return base * pulse;
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

  /** Seconds since construction — drives the lava-crack pulse in redraw(). */
  private elapsedTime = 0;

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
    this.elapsedTime += deltaSeconds;
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

        const color = avgHeight <= waterLevel ? WATER_COLOR : isRockTile ? VOLCANO_ROCK_COLOR : TERRAIN_COLOR[terrain];

        graphics
          .poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
          .fill(color)
          .stroke({ width: 1, color: 0x000000, alpha: 0.15 });

        if (isRockTile && avgHeight > waterLevel) {
          this.drawLavaCracks(graphics, x, y, p0, p1, p2, p3, avgHardness);
        }
      }
    }
  }

  /**
   * Glowing cracks radiating from a volcano tile's center — see
   * VOLCANO_ROCK_COLOR's doc comment for why lava is drawn separately from
   * the (always-dark) rock fill instead of tinting it. Two or three short
   * strokes, angled and phased by tileHash(x, y) so a given tile's cracks
   * hold their shape frame to frame and don't sync up with its neighbors,
   * fading out together with rockHardness as the tile cools.
   */
  private drawLavaCracks(
    graphics: Graphics,
    x: number,
    y: number,
    p0: { sx: number; sy: number },
    p1: { sx: number; sy: number },
    p2: { sx: number; sy: number },
    p3: { sx: number; sy: number },
    avgHardness: number,
  ): void {
    const intensity = volcanoGlowIntensity(avgHardness, VOLCANO_ROCK_HARDNESS, this.elapsedTime, tileHash(x, y));
    if (intensity <= 0.02) return;

    const centerX = (p0.sx + p1.sx + p2.sx + p3.sx) / 4;
    const centerY = (p0.sy + p1.sy + p2.sy + p3.sy) / 4;
    const alpha = LAVA_MIN_ALPHA + (1 - LAVA_MIN_ALPHA) * intensity;
    const crackColor = lerpColor(LAVA_GLOW_COLOR, LAVA_CORE_COLOR, intensity);

    // A soft halo (a big, faint disc under everything else) reads as light
    // spilling off the lava, rather than the crack lines just floating on
    // bare rock — real screens don't have additive blending here, so this
    // fakes it with plain alpha instead.
    graphics.circle(centerX, centerY, 9 + 10 * intensity).fill({ color: LAVA_GLOW_COLOR, alpha: 0.12 + 0.18 * intensity });

    const crackCount = 1 + Math.round(intensity * 2);
    for (let i = 0; i < crackCount; i++) {
      const angle = tileHash(x * 3 + i * 17, y * 5 + i * 11) * Math.PI * 2;
      const len = (TILE_WIDTH / 2.4) * (0.6 + 0.4 * intensity);
      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len * (TILE_HEIGHT / TILE_WIDTH);
      graphics
        .moveTo(centerX - dx, centerY - dy)
        .lineTo(centerX + dx, centerY + dy)
        .stroke({ width: 3, color: crackColor, alpha });
    }

    graphics.circle(centerX, centerY, 4 + 5 * intensity).fill({ color: LAVA_CORE_COLOR, alpha });
  }

  private toScreen(x: number, y: number, elevation: number) {
    return {
      sx: (x - y) * (TILE_WIDTH / 2),
      sy: (x + y) * (TILE_HEIGHT / 2) - elevation * ELEVATION_STEP,
    };
  }
}
