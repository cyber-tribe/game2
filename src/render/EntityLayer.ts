import { Container, Graphics, Sprite } from "pixi.js";
import { Drowning, FactionState, House, MoveTarget, Owner, Position, Swamp, Walker, isHeroState, type FactionId, type HeroKind } from "../game/components";
import type { Entity, World } from "../ecs";
import { FARMLAND_RADIUS, IMPACT_EFFECT_DURATION } from "../game/constants";
import { distance, type Point } from "../game/systems/geometry";
import type { ImpactEffectSnapshot, ImpactEffectType } from "../game/systems/effects";
import { GAME_PALETTE } from "./palette";
import { type IsoRenderer } from "./IsoRenderer";
import { createDitherTexture } from "./patternTexture";
import { houseFrameKey, houseTexture, loadHouseSprites } from "./houseSprites";
import {
  WALK_FRAMES,
  loadWalkerSprites,
  walkerAction,
  walkerFrameKey,
  walkerPose,
  walkerTexture,
  type Facing,
} from "./walkerSprites";

/**
 * Deterministic pseudo-random value in [0, 1) for a tile's (x, y) — fixes
 * each swamp tile's own hole/bubble placement and pulse phase so they
 * don't reshuffle every frame or all pulse in unison. Same trick as
 * walkCycle below (a hash of position, not real randomness) and
 * IsoRenderer's own tileHash, kept local here rather than shared since
 * it's a one-line, easily-duplicated formula.
 */
function swampTileHash(x: number, y: number, salt: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.3) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Quantizes a tile-space heading (dx, dy) to one of the 4 iso screen
 * diagonals a 2:1 projection produces from the 4 tile-axis directions —
 * see walkerSprites.ts's Facing doc comment. Ties (e.g. dx === dy) favor the
 * x-axis reading, which only matters for a walker heading exactly
 * diagonally in tile-space, an edge case with no single "more correct"
 * answer. (0, 0) — no real heading — also falls through to "SE", the
 * same default a walker just spawned or freshly arrived gets before it
 * has ever had a MoveTarget.
 */
export function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "SE" : "NW";
  return dy >= 0 ? "SW" : "NE";
}

/**
 * Houses and their flags. These were a brighter, uncalibrated pair of
 * literals until the palette became single-sourced (plan/archived/0089):
 * the accents below are sampled from the original, and its blue is the
 * original's own faction blue. Walkers read the same two colors, but bake
 * them into their sprite atlas rather than tinting at runtime — see
 * tools/sprites/walkers.py's FACTIONS.
 */
const FACTION_COLOR: Record<FactionId, number> = {
  player: GAME_PALETTE.playerAccent,
  enemy: GAME_PALETTE.enemyAccent,
};

/**
 * On-screen size of one art pixel of a walker's sprite. The atlas is
 * authored at 11x18 (tools/sprites/walkers.py) and drawn 1:1, so a walker
 * is 11x18 screen pixels — about a sixth of a 64px tile.
 *
 * The previous art was 5x9 drawn at 1.3, i.e. 6.5x11.7 on screen. Holding
 * that on-screen size while quadrupling the art's resolution would have
 * meant drawing every sprite at 0.6 scale, and a nearest-filtered sprite at
 * a fractional scale drops whole rows of pixels — the detail would have
 * cost legibility rather than adding any.
 */
const WALKER_PIXEL_SIZE = 1;
/** A leader renders larger, on top of the plume baked into its own frames. */
const LEADER_PIXEL_SIZE = 1.4;
/**
 * Swamp used to be a translucent purple overlay (a hazard-radius marker,
 * not real ground) — per plan/0087, it's now drawn as an actual dark
 * mud/bog surface: a dithered base (mud + a darker purple-brown speckle,
 * see SWAMP_FILL) plus a few deterministic black "holes" and a slow bubble
 * pulse, drawn per-tile in the loop below.
 */
const SWAMP_MUD_COLOR = 0x352336;
const SWAMP_SPECKLE_COLOR = 0x201522;
const SWAMP_DITHER_SIZE = 10;
const SWAMP_SPECKLE_DENSITY = 0.4;
const SWAMP_FILL = {
  texture: createDitherTexture(SWAMP_DITHER_SIZE, SWAMP_MUD_COLOR, SWAMP_SPECKLE_COLOR, SWAMP_SPECKLE_DENSITY),
  textureSpace: "global" as const,
};
const SWAMP_HOLE_COLOR = 0x0d070d;
const SWAMP_BUBBLE_COLOR = 0x6a8f5a;
/** Seconds per bubble on/off half-cycle — slow enough to read as "still water occasionally bubbling", not a strobe. */
const SWAMP_BUBBLE_PERIOD = 1.2;
/** Alpha of the farmland's soil base fill — low enough that the terrain's own slope shading still reads through it. */
const FARMLAND_SOIL_ALPHA = 0.35;
/** How many plowed-furrow lines each farmland tile gets — see the farmland loop in update(). */
const FARMLAND_FURROW_ROWS = 3;
const FARMLAND_FURROW_ALPHA = 0.45;
const SHRINE_POLE_HEIGHT = 18;
const SHRINE_FLAG_WIDTH = 10;
/** Walk-cycle frames per second — see the per-walker animation in update(). */
const WALK_CYCLE_SPEED = 7;
/**
 * Scales the per-walker phase offset off its position. Deliberately not a
 * whole number: the offset itself is `x * 3 + y * 5`, which for a walker
 * standing on integer tile coordinates is an integer — and an integer
 * offset into a 4-frame cycle only matters modulo 4, so whole groups of
 * walkers came out in lockstep. (Before the cycle became discrete, the
 * offset fed a sine and any value spread it fine.)
 */
const WALK_PHASE_SPREAD = 0.37;

/**
 * Which of the WALK_FRAMES walk-cycle frames a walker is on right now — a
 * per-walker phase offset (from its own position, so it's stable frame to
 * frame without tracking anything extra) keeps the whole army from stepping
 * in unison.
 *
 * This used to also return a screen-space `bob`, applied by shifting the
 * sprite up a fraction of a pixel. The bounce is baked into the art now
 * (the passing frames sit a pixel higher than the contact frames — see
 * BOB_BY_FRAME in tools/sprites/walkers.py), so applying it here as well
 * would double it, and a sub-pixel shift on a nearest-filtered sprite only
 * made the figure shimmer anyway.
 *
 * Pulled out as a pure function so the animation math is unit-testable
 * without needing a Graphics/canvas context.
 */
export function walkCycle(elapsedTime: number, pos: { x: number; y: number }): number {
  const phase = elapsedTime * WALK_CYCLE_SPEED + (pos.x * 3 + pos.y * 5) * WALK_PHASE_SPREAD;
  return ((Math.floor(phase) % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES;
}

/**
 * Which tile cells (identified by their (x, y) top-left corner) a swamp
 * visually covers — every cell whose center lies within `radius` of the
 * swamp's own position, clamped to the map's bounds. A screen-space circle
 * (the previous rendering) doesn't correspond to anything on an isometric
 * grid — its edge cuts across tiles at an angle that tells a player
 * nothing about which specific squares are actually dangerous. Tinting
 * whole tiles instead mirrors swampSystem's own Euclidean-distance check
 * (against a walker's exact position) as closely as a discrete grid can,
 * so the highlighted cells match what actually drowns. Pulled out as a
 * pure function so the tile selection is unit-testable without needing a
 * Graphics/canvas context.
 */
export function swampAffectedTiles(pos: Point, radius: number, mapWidth: number, mapHeight: number): Point[] {
  const minX = Math.max(0, Math.floor(pos.x - radius));
  const maxX = Math.min(mapWidth - 1, Math.ceil(pos.x + radius) - 1);
  const minY = Math.max(0, Math.floor(pos.y - radius));
  const maxY = Math.min(mapHeight - 1, Math.ceil(pos.y + radius) - 1);

  const tiles: Point[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (distance(pos, { x: x + 0.5, y: y + 0.5 }) <= radius) tiles.push({ x, y });
    }
  }
  return tiles;
}

const IMPACT_EFFECT_COLOR: Record<ImpactEffectType, number> = {
  combatDeath: 0xff3b3b,
  houseCaptured: 0xffe066,
  houseBurned: 0xff8c1a,
  drowned: 0x6a8fd9,
};

/** Screen-px radius an ImpactEffect's ring has expanded to by the time it fully fades out. */
const IMPACT_EFFECT_MAX_RADIUS = 16;

/**
 * The ring an ImpactEffectSnapshot (see game/systems/effects.ts) is drawn
 * as at a given point in its lifetime: expanding outward while fading, so
 * a kill/capture/drowning reads as a quick outward "pop" rather than a
 * static marker. `age`/`duration` are in the same units (seconds);
 * `progress` beyond [0, 1] is clamped, so a caller doesn't need to
 * pre-clamp `age`. Pulled out as a pure function so this is unit-testable
 * without a Graphics/canvas context.
 */
export function impactEffectVisual(
  type: ImpactEffectType,
  age: number,
  duration: number = IMPACT_EFFECT_DURATION,
): { color: number; radius: number; alpha: number } {
  const progress = Math.max(0, Math.min(1, duration > 0 ? age / duration : 1));
  return {
    color: IMPACT_EFFECT_COLOR[type],
    radius: IMPACT_EFFECT_MAX_RADIUS * progress,
    alpha: 1 - progress,
  };
}

/** Draws every Swamp/Walker/House in the ECS world onto the isometric map. */
export class EntityLayer {
  readonly view = new Container();
  /** Farmland, swamp and houses — everything drawn *under* the walkers. */
  private readonly graphics = new Graphics();
  /**
   * Walkers, as textured quads from the sprite atlas rather than the
   * immediate-mode rects they used to be (plan/0090). A separate Container
   * between the two Graphics keeps the old draw order intact: ground and
   * buildings below, impact effects above.
   */
  private readonly walkerLayer = new Container();
  /** Impact effects — drawn *over* the walkers, as they were before. */
  private readonly effects = new Graphics();
  /**
   * Reused Sprite instances, one per walker drawn this frame. Pooled by
   * index rather than keyed by entity: walkers are created and destroyed
   * constantly (settling, drowning, combat), and an entity-keyed map would
   * need its own eviction pass to avoid leaking a Sprite per dead walker.
   */
  private readonly walkerPool: Sprite[] = [];
  /** Buildings, likewise pooled — see pooled(). */
  private readonly houseLayer = new Container();
  private readonly housePool: Sprite[] = [];
  private elapsedTime = 0;
  /**
   * Each walker's last-known facing, kept across frames — a walker with no
   * current MoveTarget (idle, mid-settle, or a hero holding position) has
   * no heading to compute facingFor() from, so it keeps facing whichever
   * way it was last actually walking instead of snapping to a default.
   */
  private readonly lastFacing = new Map<Entity, Facing>();

  constructor(private readonly iso: IsoRenderer) {
    this.view.addChild(this.graphics, this.houseLayer, this.walkerLayer, this.effects);
  }

  /**
   * Parses the walker sprite atlas. Awaited during startup (see main.ts) so
   * the first frame already has textures; update() renders walkers as soon
   * as it resolves and simply skips them before that.
   */
  static async loadAssets(): Promise<void> {
    await Promise.all([loadWalkerSprites(), loadHouseSprites()]);
  }

  update(world: World, deltaSeconds = 0, impactEffects: readonly ImpactEffectSnapshot[] = []): void {
    this.elapsedTime += deltaSeconds;
    const g = this.graphics;
    g.clear();
    this.effects.clear();

    // Farmland (see docs/game-system.md 5節's "家の周囲は農地になり、視覚的に
    // 勢力圏を示す") drawn first, under everything else, so it reads as
    // ground coloring rather than obscuring the shrine/houses/walkers drawn
    // on top of it. Reuses swampAffectedTiles' generic "tiles within radius
    // of a point" selection. Per plan/archived/0085-isometric-house-sprites.md, this
    // is a real soil/furrow texture now, not a faction-colored overlay —
    // ownership reads from the house's own flag (drawn into its
    // sprite by tools/sprites/houses.py), not from tinting the ground a
    // whole faction's color.
    const { width: mapWidth, height: mapHeight } = this.iso.heightmap;
    for (const entity of world.query(Position, House)) {
      const pos = world.get(entity, Position)!;
      const house = world.get(entity, House)!;

      for (const tile of swampAffectedTiles(pos, FARMLAND_RADIUS[house.level], mapWidth, mapHeight)) {
        const p0 = this.iso.project(tile.x, tile.y);
        const p1 = this.iso.project(tile.x + 1, tile.y);
        const p2 = this.iso.project(tile.x + 1, tile.y + 1);
        const p3 = this.iso.project(tile.x, tile.y + 1);

        g.poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy]).fill({
          color: GAME_PALETTE.soilMid,
          alpha: FARMLAND_SOIL_ALPHA,
        });
        // Plowed furrow rows, parallel to the tile's (x, y)->(x+1, y) edge —
        // thin straight lines rather than a smooth texture, matching the
        // rest of the terrain's hard-edged pixel-art style.
        for (let row = 1; row <= FARMLAND_FURROW_ROWS; row++) {
          const t = row / (FARMLAND_FURROW_ROWS + 1);
          g.moveTo(p0.sx + (p3.sx - p0.sx) * t, p0.sy + (p3.sy - p0.sy) * t)
            .lineTo(p1.sx + (p2.sx - p1.sx) * t, p1.sy + (p2.sy - p1.sy) * t)
            .stroke({ width: 1, color: GAME_PALETTE.soilDark, alpha: FARMLAND_FURROW_ALPHA });
        }
      }
    }

    const leaderIds = new Set<Entity>();
    for (const entity of world.query(FactionState)) {
      const state = world.get(entity, FactionState)!;
      if (state.leaderId !== undefined) leaderIds.add(state.leaderId);

      const { sx, sy } = this.iso.project(state.shrinePosition.x, state.shrinePosition.y);
      g.moveTo(sx, sy)
        .lineTo(sx, sy - SHRINE_POLE_HEIGHT)
        .stroke({ width: 2, color: 0x000000, alpha: 0.6 });
      g.moveTo(sx, sy - SHRINE_POLE_HEIGHT)
        .lineTo(sx + SHRINE_FLAG_WIDTH, sy - SHRINE_POLE_HEIGHT + SHRINE_FLAG_WIDTH / 2)
        .lineTo(sx, sy - SHRINE_POLE_HEIGHT + SHRINE_FLAG_WIDTH)
        .closePath()
        .fill(FACTION_COLOR[state.id])
        .stroke({ width: 1, color: 0x000000, alpha: 0.6 });
    }

    for (const entity of world.query(Position, Swamp)) {
      const pos = world.get(entity, Position)!;
      const swamp = world.get(entity, Swamp)!;

      for (const tile of swampAffectedTiles(pos, swamp.radius, mapWidth, mapHeight)) {
        const p0 = this.iso.project(tile.x, tile.y);
        const p1 = this.iso.project(tile.x + 1, tile.y);
        const p2 = this.iso.project(tile.x + 1, tile.y + 1);
        const p3 = this.iso.project(tile.x, tile.y + 1);
        g.poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy]).fill(SWAMP_FILL);

        // A couple of deterministic dark "holes" per tile (see
        // swampTileHash) — fixed pixel marks, not a randomly reshuffling
        // texture, so the same tile always looks the same from frame to
        // frame. Bilinear-interpolated within the tile's own projected
        // quad so they stay correctly skewed on sloped/rotated ground.
        const at = (u: number, v: number) => ({
          sx: p0.sx + (p1.sx - p0.sx) * u + (p3.sx - p0.sx) * v + (p2.sx - p1.sx - (p3.sx - p0.sx)) * u * v,
          sy: p0.sy + (p1.sy - p0.sy) * u + (p3.sy - p0.sy) * v + (p2.sy - p1.sy - (p3.sy - p0.sy)) * u * v,
        });
        for (let hole = 0; hole < 2; hole++) {
          const u = swampTileHash(tile.x, tile.y, hole * 2 + 1);
          const v = swampTileHash(tile.x, tile.y, hole * 2 + 2);
          const { sx, sy } = at(u, v);
          g.circle(sx, sy, 2).fill(SWAMP_HOLE_COLOR);
        }

        // A slow, per-tile-phased bubble — visible for roughly half of
        // each SWAMP_BUBBLE_PERIOD cycle, offset by the tile's own hash so
        // a whole swamp doesn't bubble in unison.
        const bubblePhase = swampTileHash(tile.x, tile.y, 9);
        const bubbleT = ((this.elapsedTime / SWAMP_BUBBLE_PERIOD + bubblePhase) % 1) - 0.5;
        if (Math.abs(bubbleT) < 0.15) {
          const { sx, sy } = at(swampTileHash(tile.x, tile.y, 5), swampTileHash(tile.x, tile.y, 6));
          g.circle(sx, sy, 1.2).fill(SWAMP_BUBBLE_COLOR);
        }
      }
    }

    let drawnHouses = 0;
    for (const entity of world.query(Position, House, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const house = world.get(entity, House)!;
      const { sx, sy } = this.iso.project(pos.x, pos.y);

      const texture = houseTexture(houseFrameKey(owner.faction, house.level));
      if (!texture) continue;

      const sprite = this.pooled(this.housePool, this.houseLayer, drawnHouses++);
      sprite.texture = texture;
      sprite.position.set(sx, sy);
    }
    for (let i = drawnHouses; i < this.housePool.length; i++) this.housePool[i].visible = false;

    let drawnWalkers = 0;
    for (const entity of world.query(Position, Walker, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const walker = world.get(entity, Walker)!;
      const { sx, sy } = this.iso.project(pos.x, pos.y);
      const isLeader = leaderIds.has(entity);
      const heroKind = isHeroState(walker.state) ? (walker.state as HeroKind) : undefined;
      const pixelSize = isLeader ? LEADER_PIXEL_SIZE : WALKER_PIXEL_SIZE;

      const frame = walkCycle(this.elapsedTime, pos);

      const target = world.get(entity, MoveTarget);
      const facing = target ? facingFor(target.x - pos.x, target.y - pos.y) : (this.lastFacing.get(entity) ?? "SE");
      this.lastFacing.set(entity, facing);

      const action = walkerAction(walker.state, world.get(entity, Drowning) !== undefined);
      const texture = walkerTexture(
        walkerFrameKey(owner.faction, walkerPose(isLeader, heroKind), action, facing, frame),
      );
      if (!texture) continue;

      const sprite = this.pooled(this.walkerPool, this.walkerLayer, drawnWalkers++);
      sprite.texture = texture;
      // Anchored bottom-center: (sx, sy) is the walker's ground point, and
      // every atlas frame puts the feet on its bottom row (see
      // tools/sprites/walkers.py).
      sprite.position.set(sx, sy);
      sprite.scale.set(pixelSize);
    }

    // Pooled sprites past the walker count belong to walkers that have since
    // died or left; hide rather than destroy them, since the count churns
    // every few frames and the objects are cheap to keep.
    for (let i = drawnWalkers; i < this.walkerPool.length; i++) this.walkerPool[i].visible = false;

    const fx = this.effects;
    for (const effect of impactEffects) {
      const { sx, sy } = this.iso.project(effect.position.x, effect.position.y);
      const { color, radius, alpha } = impactEffectVisual(effect.type, effect.age);
      if (alpha <= 0 || radius <= 0) continue;

      fx.circle(sx, sy, radius).stroke({ width: 2, color, alpha });
    }
  }

  /**
   * The pooled Sprite at `index` in `pool`, created on first use. Anchor
   * and parent are set once here rather than per frame, since a pooled
   * sprite keeps both for its whole life.
   *
   * Pooled by index rather than keyed by entity: walkers are created and
   * destroyed constantly (settling, drowning, combat) and houses are
   * captured and burned, so an entity-keyed map would need its own eviction
   * pass to avoid leaking a Sprite per dead entity.
   */
  private pooled(pool: Sprite[], layer: Container, index: number): Sprite {
    let sprite = pool[index];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      pool[index] = sprite;
      layer.addChild(sprite);
    }
    sprite.visible = true;
    return sprite;
  }

}
