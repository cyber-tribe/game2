import type { System } from "../../ecs";
import { isRoad, isWall, type Heightmap } from "../../world/heightmap";
import { ROAD_SPEED_MULTIPLIER } from "../constants";
import { Detour, MoveTarget, Position, Walker, isHeroState } from "../components";

export interface MovementConfig {
  /**
   * The world's terrain, needed to tell whether a walker is on a road (see
   * ROAD_SPEED_MULTIPLIER) and whether a 城壁 stands in its way (see
   * stepAroundWalls). Optional: without one, everyone simply walks at their
   * own speed straight through everything, which is what every test that
   * doesn't care about terrain expects.
   */
  heightmap: Heightmap;
}

/**
 * How far off its straight-line heading a blocked walker will try to go,
 * in order — see stepAroundWalls.
 *
 * A shallow 45° first so a walker skims along a wall it met at an angle
 * instead of turning square to it; 135° last so one that has walked into a
 * corner can still back out along the wall it came in beside. Anything
 * past that is walking away from the target, which is what "no way through
 * from here" should look like instead.
 */
const DETOUR_ANGLES = [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

/**
 * One step toward `target`, going around any 城壁 in the way — the
 * movement half of the original's 「信者の進行を遮る壁」
 * (docs/original-miracles.md #12).
 *
 * Local steering rather than a path search, and the difference is worth
 * stating: this walker knows only what is directly in front of it. It
 * heads straight at its target whenever it can, and when it cannot it
 * commits to one side (`turn`, remembered in the Detour component) and
 * hugs the wall on that side until the straight line opens up again. That
 * gets a crowd around the end of any wall a player is likely to raise —
 * and it will *not* get one out of a deep pocket walled on three sides,
 * which is a fair thing for a wall to be able to do and cheaper by far
 * than re-planning a path for every walker every tick.
 *
 * Returns the position to move to plus the side to keep committed to
 * (undefined once the walker no longer needs one), or null when every
 * direction it is willing to consider is walled.
 */
export function stepAroundWalls(
  heightmap: Heightmap,
  pos: { x: number; y: number },
  target: { x: number; y: number },
  step: number,
  turn: number | undefined,
): { x: number; y: number; turn: number | undefined } | null {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: pos.x, y: pos.y, turn: undefined };

  const dirX = dx / distance;
  const dirY = dy / distance;
  const reach = Math.min(step, distance);
  const straight = { x: pos.x + dirX * reach, y: pos.y + dirY * reach };
  if (!isWall(heightmap, straight.x, straight.y)) return { ...straight, turn: undefined };

  // Once committed, only that side is considered — see Detour's doc
  // comment on why re-deciding every tick is the same as not deciding.
  const sides = turn === undefined ? [1, -1] : [turn];

  for (const angle of DETOUR_ANGLES) {
    let best: { x: number; y: number; turn: number; distance: number } | null = null;
    for (const side of sides) {
      const rotation = side * angle;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const candidate = {
        x: pos.x + (dirX * cos - dirY * sin) * step,
        y: pos.y + (dirX * sin + dirY * cos) * step,
      };
      if (isWall(heightmap, candidate.x, candidate.y)) continue;
      const remaining = Math.hypot(target.x - candidate.x, target.y - candidate.y);
      if (best === null || remaining < best.distance) {
        best = { ...candidate, turn: side, distance: remaining };
      }
    }
    // Picking the side by which one ends up nearer the target is only ever
    // done on the first blocked tick; from then on `sides` has one entry
    // and this just takes it.
    if (best) return { x: best.x, y: best.y, turn: best.turn };
  }

  return null;
}

/**
 * Moves any Position+MoveTarget+Walker entity toward its target at the
 * walker's speed, clamping so it never overshoots. Clears MoveTarget on
 * arrival so other systems (e.g. settling) can react to it.
 *
 * A walker standing on a road moves ROAD_SPEED_MULTIPLIER times faster —
 * the original's 道, "上では信者の移動速度が上がる"
 * (docs/original-miracles.md #11). Sampled at the walker's current
 * position rather than along the path: stepping onto the pavement speeds
 * you up from that tick on, stepping off slows you down again, so a road
 * is worth following even when it isn't the straight line.
 *
 * A 城壁 in the way is walked around instead of through (see
 * stepAroundWalls) — except by heroes, who cross it: 「英雄以外は越えられ
 * ない」 (docs/original-miracles.md #12). A walker that somehow finds
 * itself standing *on* a wall — the stone went up around it — ignores
 * walls for that step, so a cast can never entomb anyone permanently.
 */
export function createMovementSystem(config: Partial<MovementConfig> = {}): System {
  const heightmap = config.heightmap;

  return (world, deltaSeconds) => {
    for (const entity of world.query(Position, MoveTarget, Walker)) {
      const pos = world.get(entity, Position)!;
      const target = world.get(entity, MoveTarget)!;
      const walker = world.get(entity, Walker)!;

      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const distance = Math.hypot(dx, dy);
      const onRoad = heightmap !== undefined && isRoad(heightmap, pos.x, pos.y);
      const step = walker.speed * (onRoad ? ROAD_SPEED_MULTIPLIER : 1) * deltaSeconds;

      const blockable =
        heightmap !== undefined && !isHeroState(walker.state) && !isWall(heightmap, pos.x, pos.y);

      if (blockable) {
        const detour = world.get(entity, Detour);
        const next = stepAroundWalls(heightmap, pos, target, step, detour?.turn);
        if (next === null) continue;

        if (next.turn === undefined) world.remove(entity, Detour);
        else world.add(entity, Detour, { turn: next.turn });

        world.add(entity, Position, { x: next.x, y: next.y });
        // Only a straight step can be an arriving one: a detour never ends
        // on the target even when it lands within a step of it.
        if (next.turn === undefined && distance <= step) world.remove(entity, MoveTarget);
        continue;
      }

      if (distance <= step) {
        world.add(entity, Position, { x: target.x, y: target.y });
        world.remove(entity, MoveTarget);
      } else {
        world.add(entity, Position, {
          x: pos.x + (dx / distance) * step,
          y: pos.y + (dy / distance) * step,
        });
      }
    }
  };
}

/** The terrain-unaware movement system — see createMovementSystem. */
export const movementSystem: System = createMovementSystem();
