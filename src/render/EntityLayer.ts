import { Container, Graphics } from "pixi.js";
import { House, Owner, Position, Swamp, Walker, type FactionId, type HouseLevel } from "../game/components";
import type { World } from "../ecs";
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
const SWAMP_COLOR = 0x6a3fa0;

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
      const { sx, sy } = this.iso.project(pos.x, pos.y);

      g.circle(sx, sy - WALKER_RADIUS, WALKER_RADIUS)
        .fill(FACTION_COLOR[owner.faction])
        .stroke({ width: 1, color: 0x000000, alpha: 0.5 });
    }
  }
}
