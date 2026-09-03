import { Container, Graphics } from "pixi.js";
import { FactionState, House, Owner, Position, Swamp, Walker, type FactionId, type HouseLevel } from "../game/components";
import type { Entity, World } from "../ecs";
import { TILE_WIDTH, type IsoRenderer } from "./IsoRenderer";

const FACTION_COLOR: Record<FactionId, number> = {
  player: 0x4fa8ff,
  enemy: 0xd94f4f,
};

const HOUSE_SIZE: Record<HouseLevel, number> = {
  hut: 10,
  lodge: 14,
  manor: 18,
  castle: 24,
};

const WALKER_RADIUS = 3;
const LEADER_RADIUS = WALKER_RADIUS * 1.8;
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
      const size = HOUSE_SIZE[house.level];

      g.rect(sx - size / 2, sy - size, size, size)
        .fill(FACTION_COLOR[owner.faction])
        .stroke({ width: 1, color: 0x000000, alpha: 0.4 });
    }

    for (const entity of world.query(Position, Walker, Owner)) {
      const pos = world.get(entity, Position)!;
      const owner = world.get(entity, Owner)!;
      const walker = world.get(entity, Walker)!;
      const { sx, sy } = this.iso.project(pos.x, pos.y);
      const isLeader = leaderIds.has(entity);
      const isKnight = walker.state === "knight";
      const radius = isLeader ? LEADER_RADIUS : WALKER_RADIUS;

      g.circle(sx, sy - radius, radius)
        .fill(isKnight ? KNIGHT_COLOR : FACTION_COLOR[owner.faction])
        .stroke({ width: isLeader ? 2 : 1, color: isLeader ? 0xffffff : 0x000000, alpha: isLeader ? 0.9 : 0.5 });
    }
  }
}
