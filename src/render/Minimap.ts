import { Container, Graphics } from "pixi.js";
import type { World } from "../ecs";
import { House, Owner, Position, Walker, type FactionId } from "../game/components";
import type { Heightmap } from "../world/heightmap";

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

const HOUSE_DOT_SIZE = 3;
const WALKER_DOT_RADIUS = 1;

/**
 * A small top-down overview of the whole map — docs/game-system.md's UI
 * section calls for exactly this: "世界儀（ミニマップ）：世界全体の
 * 俯瞰。クリックで視点移動". It was never actually built. That gap
 * matters more now that the enemy AI acts on its own (see
 * enemyMiracles.ts / enemyTerraform.ts): anything happening outside the
 * player's current pan/zoom is otherwise completely invisible until they
 * happen to scroll there.
 *
 * Deliberately simple — a flat top-down dot plot, not a scaled-down
 * isometric render — since all it needs to convey is "where is
 * everything", not what the terrain looks like up close.
 */
export class Minimap {
  readonly view = new Container();
  private readonly entities = new Graphics();

  constructor(
    private readonly heightmap: Heightmap,
    readonly size: number,
  ) {
    const background = new Graphics()
      .rect(0, 0, size, size)
      .fill({ color: TERRAIN_COLOR[heightmap.terrain], alpha: 0.92 })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    this.view.addChild(background, this.entities);
  }

  /** World (tile) coordinates for a tap at this minimap's own local coordinates. */
  toWorld(localX: number, localY: number): { x: number; y: number } {
    return {
      x: (localX / this.size) * this.heightmap.width,
      y: (localY / this.size) * this.heightmap.height,
    };
  }

  update(world: World): void {
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
  }

  private toMinimapPoint(pos: { x: number; y: number }): { x: number; y: number } {
    return {
      x: (pos.x / this.heightmap.width) * this.size,
      y: (pos.y / this.heightmap.height) * this.size,
    };
  }
}
