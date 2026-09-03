import { Container, Graphics } from "pixi.js";
import { FactionState, House, Owner, Position, Swamp, Walker, type FactionId } from "../game/components";
import type { Entity, World } from "../ecs";
import { TILE_WIDTH, type IsoRenderer } from "./IsoRenderer";
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
const SWAMP_COLOR = 0x6a3fa0;
const SHRINE_POLE_HEIGHT = 18;
const SHRINE_FLAG_WIDTH = 10;

/** Draws every Swamp/Walker/House in the ECS world onto the isometric map. */
export class EntityLayer {
  readonly view = new Container();
  private readonly graphics = new Graphics();

  constructor(private readonly iso: IsoRenderer) {
    this.view.addChild(this.graphics);
  }

  update(world: World): void {
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
      const { sx, sy } = this.iso.project(pos.x, pos.y);
      const screenRadius = swamp.radius * (TILE_WIDTH / 2);

      g.circle(sx, sy, screenRadius)
        .fill({ color: SWAMP_COLOR, alpha: 0.55 })
        .stroke({ width: 1, color: 0x2a1a3a, alpha: 0.6 });
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
      const isKnight = walker.state === "knight";
      const pixelSize = isLeader ? LEADER_PIXEL_SIZE : WALKER_PIXEL_SIZE;

      if (isLeader) {
        g.circle(sx, sy - LEADER_HALO_RADIUS, LEADER_HALO_RADIUS).fill({ color: 0xffffff, alpha: 0.35 });
      }
      drawWalkerSprite(g, sx, sy, isKnight ? KNIGHT_COLOR : FACTION_COLOR[owner.faction], pixelSize);
    }
  }
}
