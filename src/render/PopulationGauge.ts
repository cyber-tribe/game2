import { Container, Graphics } from "pixi.js";
import { GAME_PALETTE } from "./palette";

/**
 * The 円形劇場 — the amphitheatre the original hangs in the black space at
 * the top right of the screen, opposite the world map's own rock (see
 * Minimap's drawIsland).
 *
 * **This is a building that happens to be a gauge, not a gauge dressed as a
 * building.** The distinction is the whole point of drawing it at all. A
 * two-colour bar states the population split accurately and says nothing
 * else; the original's theatre says the same number while also being a
 * thing in the world, which is what makes the screen read as a god looking
 * down on one rather than as a strategy game with a status bar.
 *
 * So the drawing is built as architecture and the gauge falls out of it:
 *
 * - The floor is an **ellipse**, i.e. a circle seen from above at an angle,
 *   which is what puts the structure in the same projection as the world.
 * - The **seating** is the whole ring around that floor, split into wedges.
 *   Those wedges are the gauge, and the border between the two colours is a
 *   line sliding across the bowl — the front line between the two gods,
 *   drawn inside the building rather than beside it.
 * - **Columns** stand on the outer rim and are painted far-to-near
 *   (columnDepthOrder), so the ones at the sides pass in front of the ones
 *   at the back. That overlap is the single cheapest cue that this has
 *   depth; without it the same columns read as a bar chart.
 * - A **podium** of rock carries it, with shards hanging off the underside
 *   into the void, matching the world map's island and the world's own cut
 *   side.
 *
 * Schematic rather than a pixel copy: it has to hold up at about 100px
 * across on a phone, where a faithfully detailed theatre would be mud.
 */

/**
 * Wedges of seating. Even, so a dead-level match splits exactly down the
 * middle — an odd count cannot, and would have to hand the middle wedge to
 * one side or the other. 16 also puts the readout at ~6% steps, which is
 * finer than the eye needs for "who is ahead" and far coarser than the
 * number itself, which is the correct trade for a thing read at a glance.
 */
const SEGMENTS = 16;

/** Flattening of the floor's circle — the smaller, the higher the viewing angle. */
const ELLIPSE_FLATTEN = 0.42;
/** Where the seating's inner edge sits, as a fraction of the outer radius. */
const SEATING_INNER = 0.58;
/** Column height and width, as fractions of the structure's own width. */
const COLUMN_HEIGHT = 0.3;
const COLUMN_WIDTH = 0.035;
/** Podium depth and the shards below it, as fractions of the width. */
const PODIUM_HEIGHT = 0.1;
const FRINGE_LENGTH = 0.14;
const FRINGE_COUNT = 7;
/** Points sampled along each wedge's arcs — enough that the curve reads as a curve. */
const ARC_STEPS = 4;

const FACTION_COLOR = {
  player: 0x4fa8ff,
  enemy: 0xd94f4f,
} as const;

/**
 * Where the border between the two colours falls across the bowl, as a
 * fraction of its width from the left edge — 0 when the enemy holds
 * everything, 1 when the player does.
 *
 * A sliding line rather than a count of wedges: the seating is a full ring,
 * so "who holds this seat" is a question about *position* in the bowl, and
 * a border that moves smoothly across it says the same thing a marching
 * front line does. Every wedge belongs to one side or the other — a gap
 * would read as "nobody holds this", which is never true.
 */
export function seatingBorder(playerShare: number): number {
  return Math.max(0, Math.min(1, playerShare));
}

/** Whether the wedge whose centre sits at `x` (0..1 across the bowl) is the player's. */
export function wedgeIsPlayers(centerX: number, border: number): boolean {
  return centerX <= border;
}

/**
 * The order the rim's columns must be painted in for the structure to have
 * depth: farthest first, so nearer columns overlap them.
 *
 * The seating is the *far* half of the ellipse, so a column's depth is just
 * its height on screen — the one at the very back sits highest, the ones at
 * the far left and right sit lowest and are nearest the viewer. Returned as
 * boundary indices (there is one more column than there are wedges: one at
 * each end of every wedge).
 */
export function columnDepthOrder(segments: number = SEGMENTS): number[] {
  const indices = Array.from({ length: segments + 1 }, (_, i) => i);
  // sin(angle) peaks at the middle boundary; larger sin = further away.
  const depth = (i: number) => Math.sin(Math.PI * (1 - i / segments));
  return indices.sort((a, b) => depth(b) - depth(a));
}

/** A point on the floor's ellipse at `angle` radians, measured from the right, going up. */
function rimPoint(cx: number, cy: number, rx: number, ry: number, angle: number): { x: number; y: number } {
  return { x: cx + rx * Math.cos(angle), y: cy - ry * Math.sin(angle) };
}

export class PopulationGauge {
  readonly view = new Container();
  private readonly structure = new Graphics();
  private readonly seating = new Graphics();
  private readonly columns = new Graphics();

  private readonly cx: number;
  private readonly cy: number;
  private readonly rx: number;
  private readonly ry: number;

  constructor(readonly width: number) {
    this.rx = width / 2;
    this.ry = width * ELLIPSE_FLATTEN * 0.5;
    this.cx = width / 2;
    // Low enough that the tallest column, at the very back, starts at y = 0.
    this.cy = this.ry + width * COLUMN_HEIGHT;

    // Seating under the columns: a column in front of a wedge must hide it.
    this.view.addChild(this.structure, this.seating, this.columns);
    this.drawStructure();
  }

  /** Total height the structure occupies, so a caller can place it against a screen edge. */
  get height(): number {
    return this.cy + this.ry + this.width * (PODIUM_HEIGHT + FRINGE_LENGTH);
  }

  /** The parts that never change: podium, shards, outer shell and floor. */
  private drawStructure(): void {
    const g = this.structure;
    const { cx, cy, rx, ry, width } = this;
    const podium = width * PODIUM_HEIGHT;
    const fringe = width * FRINGE_LENGTH;

    // The rock, following the near edge of the ellipse and tapering away
    // below — the theatre stands on an island, like everything else here.
    const podiumTop: number[] = [];
    for (let i = 0; i <= ARC_STEPS * 4; i++) {
      const angle = Math.PI + Math.PI * (i / (ARC_STEPS * 4));
      podiumTop.push(cx + rx * Math.cos(angle), cy - ry * Math.sin(angle));
    }
    g.poly([...podiumTop, cx + rx * 0.7, cy + ry + podium, cx - rx * 0.7, cy + ry + podium]).fill(
      GAME_PALETTE.stoneDark,
    );

    for (let i = 0; i < FRINGE_COUNT; i++) {
      const t = (i + 0.5) / FRINGE_COUNT;
      const x = cx + (t - 0.5) * rx * 1.4;
      const half = (rx * 1.4) / FRINGE_COUNT / 2;
      const top = cy + ry + podium - 1;
      const length = fringe * (0.45 + 0.55 * Math.sin(t * Math.PI));
      g.poly([x - half, top, x + half, top, x, top + length]).fill(
        i % 2 === 0 ? GAME_PALETTE.stoneShadow : GAME_PALETTE.stoneDark,
      );
    }

    // The outer shell of the bowl, then the arena floor sunk inside it.
    g.ellipse(cx, cy, rx, ry).fill(GAME_PALETTE.stoneLight);
    g.ellipse(cx, cy, rx * SEATING_INNER, ry * SEATING_INNER).fill(GAME_PALETTE.stoneShadow);
  }

  /** Redraws the seating and columns for the player's share of the total population. */
  update(playerShare: number): void {
    const { cx, cy, rx, ry, width } = this;
    const border = seatingBorder(playerShare);

    const sg = this.seating;
    sg.clear();
    // The seating is the whole ring, so every wedge spans 1/SEGMENTS of a
    // full turn rather than of the far half.
    for (let i = 0; i < SEGMENTS; i++) {
      const from = (i / SEGMENTS) * Math.PI * 2;
      const to = ((i + 1) / SEGMENTS) * Math.PI * 2;

      const points: number[] = [];
      for (let s = 0; s <= ARC_STEPS; s++) {
        const p = rimPoint(cx, cy, rx, ry, from + (to - from) * (s / ARC_STEPS));
        points.push(p.x, p.y);
      }
      for (let s = ARC_STEPS; s >= 0; s--) {
        const p = rimPoint(cx, cy, rx * SEATING_INNER, ry * SEATING_INNER, from + (to - from) * (s / ARC_STEPS));
        points.push(p.x, p.y);
      }

      // Position across the bowl: cos is -1 at the left rim and +1 at the
      // right, so this is 0 on the left and 1 on the right — the player
      // fills from the left, as the bar this replaces did.
      const centerX = (Math.cos((from + to) / 2) + 1) / 2;
      sg.poly(points).fill(wedgeIsPlayers(centerX, border) ? FACTION_COLOR.player : FACTION_COLOR.enemy);
    }

    const cg = this.columns;
    cg.clear();
    const columnWidth = width * COLUMN_WIDTH;
    const columnHeight = width * COLUMN_HEIGHT;
    for (const boundary of columnDepthOrder()) {
      const base = rimPoint(cx, cy, rx, ry, Math.PI * (boundary / SEGMENTS));
      const top = base.y - columnHeight;

      // Shaft, then a lit left face and a cap, so each column has a side to
      // it rather than being a flat stroke.
      cg.rect(base.x - columnWidth / 2, top, columnWidth, columnHeight).fill(GAME_PALETTE.stoneDark);
      cg.rect(base.x - columnWidth / 2, top, columnWidth / 2, columnHeight).fill(GAME_PALETTE.stoneLight);
      cg.rect(base.x - columnWidth, top - columnWidth, columnWidth * 2, columnWidth).fill(GAME_PALETTE.parchment);
    }
  }
}
