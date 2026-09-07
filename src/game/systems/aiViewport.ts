import type { Point } from "./geometry";

/**
 * The enemy god's stand-in for the player's screen.
 *
 * The player may only cast while at least one of their own walkers,
 * houses or their shrine is actually being drawn on screen, and may only
 * tap somewhere that same screen shows — see main.ts's isOnScreen /
 * isOwnFactionVisible and plan/archived/0063-visibility-gated-casting.md.
 * That rule was written as a *player* rule ("the AI has no camera"),
 * which quietly left the enemy god able to strike any square of the map
 * from anywhere, with nothing of its own within forty tiles. Having no
 * camera is not the same as needing no reach limit.
 *
 * So the enemy gets a camera, and it is the same *shape* as the player's.
 * That shape matters more than its size: a screen is a rectangle in
 * pixels, but this world is isometric, so in tile space it is a long thin
 * diamond — wide along the axis running down the screen (x+y), narrow
 * across it (x-y). A god may reach a long way down the valley it is
 * looking along and barely at all to either side of it, which is a much
 * more interesting constraint than any circle, and it is the one the
 * player has always played under without it ever being written down.
 *
 * Deliberately not modeled: the player can also rotate and zoom the
 * camera, which reshapes their own diamond. The enemy's stays at the
 * default orientation and scale, so where the two differ, the player has
 * the wider reach.
 */
export interface AiViewport {
  centerX: number;
  centerY: number;
  /** Tiles of (x - y) the view spans — its narrow axis, across the screen. */
  spanAcross: number;
  /** Tiles of (x + y) the view spans — its long axis, down the screen. */
  spanAlong: number;
}

/** Whether a tile-space point falls inside `viewport`. */
export function isInsideViewport(point: Point, viewport: AiViewport): boolean {
  const across = point.x - point.y - (viewport.centerX - viewport.centerY);
  const along = point.x + point.y - (viewport.centerX + viewport.centerY);
  return Math.abs(across) <= viewport.spanAcross / 2 && Math.abs(along) <= viewport.spanAlong / 2;
}

/** Whether any of `own` — the caster's own walkers, houses and shrine — is inside `viewport`. */
export function isOwnFactionInViewport(own: readonly Point[], viewport: AiViewport): boolean {
  return own.some((point) => isInsideViewport(point, viewport));
}

/**
 * The view the enemy god would move its camera to in order to cast at
 * `target`: centred halfway between the target and whichever of its own
 * it can most easily hold in the same view — the same thing a player
 * does by hand, scrolling toward the front line, keeping one of their own
 * at the near edge and reaching for the far edge.
 *
 * Returns null when no placement of a view this shape holds both, i.e.
 * when the target is out of the god's reach. Nothing here clamps the view
 * to the map: a player's camera can hang over the map's edge too, and
 * clamping would quietly shorten the god's reach along the borders only.
 */
export function chooseAiViewport(
  own: readonly Point[],
  target: Point,
  spanAcross: number,
  spanAlong: number,
): AiViewport | null {
  let nearest: Point | undefined;
  let nearestCost = Infinity;

  for (const point of own) {
    // Ranked in the view's own axes rather than by plain distance: what
    // decides whether one view holds both points is how far apart they
    // are across the screen and along it, measured against how much room
    // the view has in each direction.
    const across = Math.abs(point.x - point.y - (target.x - target.y)) / spanAcross;
    const along = Math.abs(point.x + point.y - (target.x + target.y)) / spanAlong;
    const cost = Math.max(across, along);
    if (cost < nearestCost) {
      nearestCost = cost;
      nearest = point;
    }
  }
  if (!nearest) return null;

  const viewport: AiViewport = {
    centerX: (nearest.x + target.x) / 2,
    centerY: (nearest.y + target.y) / 2,
    spanAcross,
    spanAlong,
  };

  // Asked as the player's own rule asks it, rather than short-circuited
  // into one comparison: these are the same two questions main.ts
  // answers, and this should read that way.
  if (!isOwnFactionInViewport(own, viewport)) return null;
  if (!isInsideViewport(target, viewport)) return null;
  return viewport;
}
