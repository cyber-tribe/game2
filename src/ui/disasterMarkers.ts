import { DISASTER_MARKER_DURATION } from "../game/constants";

export interface DisasterMark {
  x: number;
  y: number;
  /** Seconds of match time at which it was recorded — see DisasterMarkers.record. */
  at: number;
}

/**
 * Where the enemy's miracles have just landed, for the world map to point
 * at — the original's 「災害箇所表示」, one of the ten per-stage ○×
 * settings (docs/original-maps.md).
 *
 * Kept as its own small thing rather than inside Minimap because it is not
 * a drawing concern: what a stage grants is the *knowledge* of where you
 * were hit, and the map is only where that knowledge is shown. A stage that
 * withholds it simply never asks for the list.
 *
 * Marks expire. A permanent pin would turn into a map of the whole match
 * rather than a warning — the point is "go there now", and an hour-old
 * crater is somewhere the player has already dealt with or already lost.
 */
export class DisasterMarkers {
  private marks: DisasterMark[] = [];

  /** `now` is match time in seconds, as the simulation counts it. */
  record(position: { x: number; y: number }, now: number): void {
    this.marks.push({ x: position.x, y: position.y, at: now });
    this.prune(now);
  }

  /** The marks still worth showing at `now`, oldest first. */
  active(now: number): readonly DisasterMark[] {
    this.prune(now);
    return this.marks;
  }

  private prune(now: number): void {
    // Pruned on both paths so a match that stops casting does not leave the
    // last few marks pinned forever, and one that casts constantly does not
    // grow the list without bound.
    this.marks = this.marks.filter((mark) => now - mark.at < DISASTER_MARKER_DURATION);
  }
}
