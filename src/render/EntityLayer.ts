import { Container, Graphics } from "pixi.js";
import { FactionState, House, Owner, Position, Swamp, Walker, type FactionId } from "../game/components";
import type { Entity, World } from "../ecs";
import { FARMLAND_RADIUS, IMPACT_EFFECT_DURATION } from "../game/constants";
import { distance, type Point } from "../game/systems/geometry";
import type { ImpactEffectSnapshot, ImpactEffectType } from "../game/systems/effects";
import { GAME_PALETTE } from "./palette";
import { type IsoRenderer } from "./IsoRenderer";
import { drawHouseSprite, drawWalkerSprite } from "./pixelArt";

const FACTION_COLOR: Record<FactionId, number> = {
  player: 0x4fa8ff,
  enemy: 0xd94f4f,
};

/** Pixel size of one "pixel" in a walker's sprite (see pixelArt.ts's WALKER_PATTERN, 5 cols wide). */
const WALKER_PIXEL_SIZE = 1.3;
const LEADER_PIXEL_SIZE = WALKER_PIXEL_SIZE * 1.8;
/** Radius of the highlight halo drawn behind a leader's sprite. */
const LEADER_HALO_RADIUS = 7;
const KNIGHT_COLOR = 0xffcc00;
const GUARDIAN_COLOR = 0x33e0ff;
const SWAMP_COLOR = 0x6a3fa0;
/** Alpha of the farmland's soil base fill — low enough that the terrain's own slope shading still reads through it. */
const FARMLAND_SOIL_ALPHA = 0.35;
/** How many plowed-furrow lines each farmland tile gets — see the farmland loop in update(). */
const FARMLAND_FURROW_ROWS = 3;
const FARMLAND_FURROW_ALPHA = 0.45;
const SHRINE_POLE_HEIGHT = 18;
const SHRINE_FLAG_WIDTH = 10;
/** Radians/second the walk-cycle phase advances — see the per-walker animation in update(). */
const WALK_CYCLE_SPEED = 6;
/** How far (screen px) a walker bobs at the peak of its step. */
const WALK_BOB_AMPLITUDE = 1;

/**
 * The walk-cycle state for a walker at a given moment — a per-walker phase
 * offset (from its own position, so it's stable frame to frame without
 * tracking anything extra) keeps the whole army from stepping in unison.
 * Pulled out as a pure function so the animation math is unit-testable
 * without needing a Graphics/canvas context.
 */
export function walkCycle(
  elapsedTime: number,
  pos: { x: number; y: number },
): { stepping: boolean; bob: number } {
  const phase = elapsedTime * WALK_CYCLE_SPEED + (pos.x * 3 + pos.y * 5);
  return { stepping: Math.sin(phase) > 0, bob: Math.abs(Math.sin(phase)) * WALK_BOB_AMPLITUDE };
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
  private readonly graphics = new Graphics();
  private elapsedTime = 0;

  constructor(private readonly iso: IsoRenderer) {
    this.view.addChild(this.graphics);
  }

  update(world: World, deltaSeconds = 0, impactEffects: readonly ImpactEffectSnapshot[] = []): void {
    this.elapsedTime += deltaSeconds;
    const g = this.graphics;
    g.clear();

    // Farmland (see docs/game-system.md 5節's "家の周囲は農地になり、視覚的に
    // 勢力圏を示す") drawn first, under everything else, so it reads as
    // ground coloring rather than obscuring the shrine/houses/walkers drawn
    // on top of it. Reuses swampAffectedTiles' generic "tiles within radius
    // of a point" selection. Per plan/0085-isometric-house-sprites.md, this
    // is a real soil/furrow texture now, not a faction-colored overlay —
    // ownership reads from the house's own flag (see pixelArt.ts's
    // drawFlag), not from tinting the ground a whole faction's color.
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

        g.poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
          .fill({ color: SWAMP_COLOR, alpha: 0.55 })
          .stroke({ width: 1, color: 0x2a1a3a, alpha: 0.6 });
      }
    }

    for (const entity of world.query(Position, House, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const house = world.get(entity, House)!;
      const { sx, sy } = this.iso.project(pos.x, pos.y);

      drawHouseSprite(g, sx, sy, house.level, FACTION_COLOR[owner.faction]);
    }

    for (const entity of world.query(Position, Walker, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const walker = world.get(entity, Walker)!;
      const { sx, sy } = this.iso.project(pos.x, pos.y);
      const isLeader = leaderIds.has(entity);
      const heroColor = walker.state === "knight" ? KNIGHT_COLOR : walker.state === "guardian" ? GUARDIAN_COLOR : undefined;
      const pixelSize = isLeader ? LEADER_PIXEL_SIZE : WALKER_PIXEL_SIZE;

      const { stepping, bob } = walkCycle(this.elapsedTime, pos);

      if (isLeader) {
        g.circle(sx, sy - bob - LEADER_HALO_RADIUS, LEADER_HALO_RADIUS).fill({ color: 0xffffff, alpha: 0.35 });
      }
      drawWalkerSprite(g, sx, sy - bob, heroColor ?? FACTION_COLOR[owner.faction], pixelSize, stepping);
    }

    for (const effect of impactEffects) {
      const { sx, sy } = this.iso.project(effect.position.x, effect.position.y);
      const { color, radius, alpha } = impactEffectVisual(effect.type, effect.age);
      if (alpha <= 0 || radius <= 0) continue;

      g.circle(sx, sy, radius).stroke({ width: 2, color, alpha });
    }
  }
}
