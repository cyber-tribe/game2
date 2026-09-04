import { Container, Graphics } from "pixi.js";
import { FactionState, House, Owner, Position, Swamp, Walker, type FactionId, type HouseLevel } from "../game/components";
import type { Entity, World } from "../ecs";
import { HOUSE_LEVEL_FLATNESS_REQUIREMENT, HOUSE_LEVEL_ORDER, HOUSE_UPGRADE_FLATNESS_RADIUS } from "../game/constants";
import { distance, type Point } from "../game/systems/geometry";
import { countFlatNeighbors } from "../world/heightmap";
import { type IsoRenderer } from "./IsoRenderer";
import { drawHouseSprite, drawWalkerSprite, HOUSE_PATTERN_WIDTH } from "./pixelArt";

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
const SWAMP_COLOR = 0x6a3fa0;
const SHRINE_POLE_HEIGHT = 18;
const SHRINE_FLAG_WIDTH = 10;
const FLATNESS_BAR_HEIGHT = 3;
const FLATNESS_BAR_GAP = 2;
const FLATNESS_BAR_COLOR = 0xffe066;
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

/** Draws every Swamp/Walker/House in the ECS world onto the isometric map. */
export class EntityLayer {
  readonly view = new Container();
  private readonly graphics = new Graphics();
  private elapsedTime = 0;

  constructor(private readonly iso: IsoRenderer) {
    this.view.addChild(this.graphics);
  }

  update(world: World, deltaSeconds = 0): void {
    this.elapsedTime += deltaSeconds;
    const g = this.graphics;
    g.clear();

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
      const { width: mapWidth, height: mapHeight } = this.iso.heightmap;

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
      this.drawFlatnessBar(g, pos, house, sx, sy, HOUSE_PATTERN_WIDTH[house.level]);
    }

    for (const entity of world.query(Position, Walker, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const walker = world.get(entity, Walker)!;
      const { sx, sy } = this.iso.project(pos.x, pos.y);
      const isLeader = leaderIds.has(entity);
      const isKnight = walker.state === "knight";
      const pixelSize = isLeader ? LEADER_PIXEL_SIZE : WALKER_PIXEL_SIZE;

      const { stepping, bob } = walkCycle(this.elapsedTime, pos);

      if (isLeader) {
        g.circle(sx, sy - bob - LEADER_HALO_RADIUS, LEADER_HALO_RADIUS).fill({ color: 0xffffff, alpha: 0.35 });
      }
      drawWalkerSprite(g, sx, sy - bob, isKnight ? KNIGHT_COLOR : FACTION_COLOR[owner.faction], pixelSize, stepping);
    }
  }

  /**
   * A small bar under a house showing progress toward its next level —
   * per the reference game's core loop, "flatten the land right around
   * your own house to grow it" (docs/game-system.md's House.level
   * terrain-dependent upgrade). Without this, HOUSE_LEVEL_FLATNESS_
   * REQUIREMENT is invisible: the player sees a house upgrade only after
   * the fact, with no feedback on how close they are while flattening.
   * Omitted once a house is already at the top level (castle) — there's
   * nothing left to progress toward.
   */
  private drawFlatnessBar(
    g: Graphics,
    pos: { x: number; y: number },
    house: { level: HouseLevel },
    sx: number,
    sy: number,
    size: number,
  ): void {
    const levelIndex = HOUSE_LEVEL_ORDER.indexOf(house.level);
    if (levelIndex === HOUSE_LEVEL_ORDER.length - 1) return;

    const nextLevel = HOUSE_LEVEL_ORDER[levelIndex + 1];
    const currentRequirement = HOUSE_LEVEL_FLATNESS_REQUIREMENT[house.level];
    const nextRequirement = HOUSE_LEVEL_FLATNESS_REQUIREMENT[nextLevel];
    const flatCount = countFlatNeighbors(this.iso.heightmap, pos.x, pos.y, HOUSE_UPGRADE_FLATNESS_RADIUS);
    const progress = Math.max(
      0,
      Math.min(1, (flatCount - currentRequirement) / (nextRequirement - currentRequirement)),
    );

    const barY = sy + FLATNESS_BAR_GAP;
    g.rect(sx - size / 2, barY, size, FLATNESS_BAR_HEIGHT).fill({ color: 0x000000, alpha: 0.45 });
    if (progress > 0) {
      g.rect(sx - size / 2, barY, size * progress, FLATNESS_BAR_HEIGHT).fill({
        color: FLATNESS_BAR_COLOR,
        alpha: 0.9,
      });
    }
  }
}
