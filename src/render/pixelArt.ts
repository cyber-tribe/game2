import type { Graphics } from "pixi.js";
import type { HouseLevel } from "../game/components";
import { GAME_PALETTE } from "./palette";

/**
 * A pixel-art pattern: one string per row, one character per column.
 * '.' is transparent; any other character is a palette key resolved via
 * the `palette` passed to drawPixelPattern. Rows need not be equal
 * length short of the widest row (shorter rows are just padded on read).
 */
type Pattern = readonly string[];
type Palette = Record<string, number>;

/**
 * Simple front-facing pixel person: a "W" (walker) pattern reusing a
 * single palette key, since — unlike a house — the whole body is one
 * color (faction, or a hero color like KNIGHT_COLOR/GUARDIAN_COLOR for a
 * promoted leader). Walkers stay front-facing pixel-pattern sprites for
 * now — directional/isometric walker sprites are plan/0084's Phase 3
 * ("Directional followers"), not this pass.
 *
 * Two frames — feet together vs. feet apart — give a minimal walk cycle
 * (see EntityLayer's per-walker phase animation) instead of a single
 * frozen pose; per feedback that pixel art alone didn't yet read as
 * "alive", only as "no longer a plain circle".
 */
const WALKER_PATTERN_STAND: Pattern = [".WWW.", ".WWW.", ".WWW.", "WWWWW", ".WWW.", ".W.W.", ".W.W."];
const WALKER_PATTERN_STEP: Pattern = [".WWW.", ".WWW.", ".WWW.", "WWWWW", ".WWW.", "W...W", ".W.W."];

/**
 * Draws a Pattern as a grid of filled squares ("pixels"), anchored so the
 * pattern's horizontal center sits at `centerX` and its bottom row sits
 * at `bottomY` — the same anchor EntityLayer already projects walkers/
 * houses onto (their ground point). `pixelSize` is derived by the caller
 * from the pattern's own width so every house level keeps roughly its
 * existing on-screen footprint regardless of how many columns its
 * pattern has.
 */
function drawPixelPattern(
  g: Graphics,
  pattern: Pattern,
  palette: Palette,
  centerX: number,
  bottomY: number,
  pixelSize: number,
): void {
  const cols = Math.max(...pattern.map((row) => row.length));
  const rows = pattern.length;
  const left = centerX - (cols * pixelSize) / 2;
  const top = bottomY - rows * pixelSize;

  for (let y = 0; y < rows; y++) {
    const row = pattern[y];
    for (let x = 0; x < cols; x++) {
      const key = row[x];
      if (!key || key === ".") continue;
      const color = palette[key];
      if (color === undefined) continue;
      g.rect(left + x * pixelSize, top + y * pixelSize, pixelSize, pixelSize).fill(color);
    }
  }
}

/**
 * Draws a pixel-art walker (a small person) instead of a plain circle.
 * `color` is the faction color, or a hero color (KNIGHT_COLOR/GUARDIAN_
 * COLOR) for a promoted walker — the whole body is one color, so
 * ownership/state reads the same way a flat circle did, just shaped like a
 * person now. `stepping` picks
 * between the two walk-cycle frames (see WALKER_PATTERN_STAND/_STEP);
 * EntityLayer alternates it over time so the sprite is never frozen.
 */
export function drawWalkerSprite(
  g: Graphics,
  centerX: number,
  groundY: number,
  color: number,
  scale: number,
  stepping: boolean,
): void {
  drawPixelPattern(g, stepping ? WALKER_PATTERN_STEP : WALKER_PATTERN_STAND, { W: color }, centerX, groundY, scale);
}

const P = GAME_PALETTE;

/** A screen-space point, local to a building's own (centerX, groundY) anchor. */
interface Pt {
  x: number;
  y: number;
}

/**
 * The 4 ground-level corners of an isometric "footprint diamond" plus
 * their wall-top counterparts, in the same 2:1 (TILE_WIDTH:TILE_HEIGHT)
 * ratio IsoRenderer's own terrain projection uses — so a house's footprint
 * reads at the same isometric angle as the ground it stands on, per
 * plan/0085-isometric-house-sprites.md's "地面と同じisometric perspective
 * になっている" completion condition. `front` is the corner nearest the
 * camera (where the ground anchor point sits); `left`/`right` are the two
 * faces actually rendered (the far/`back` corner and both far faces are
 * never visible from this angle, same as a terrain tile's hidden underside).
 */
interface FootprintGeometry {
  front: Pt;
  left: Pt;
  right: Pt;
  back: Pt;
  frontTop: Pt;
  leftTop: Pt;
  rightTop: Pt;
  backTop: Pt;
  apex: Pt;
}

function footprint(halfWidth: number, wallHeight: number, roofHeight: number): FootprintGeometry {
  const halfDepth = halfWidth / 2; // TILE_WIDTH:TILE_HEIGHT is 2:1
  const front: Pt = { x: 0, y: 0 };
  const right: Pt = { x: halfWidth, y: -halfDepth };
  const back: Pt = { x: 0, y: -halfWidth };
  const left: Pt = { x: -halfWidth, y: -halfDepth };
  const up = (p: Pt, dy: number): Pt => ({ x: p.x, y: p.y - dy });
  return {
    front,
    left,
    right,
    back,
    frontTop: up(front, wallHeight),
    leftTop: up(left, wallHeight),
    rightTop: up(right, wallHeight),
    backTop: up(back, wallHeight),
    apex: up(front, wallHeight + roofHeight),
  };
}

function poly(g: Graphics, points: Pt[], centerX: number, groundY: number, color: number): void {
  g.poly(points.flatMap((p) => [centerX + p.x, groundY + p.y])).fill(color);
}

/**
 * Draws the two visible wall faces (left = lit, right = shadowed — the
 * same fixed-light-source convention IsoRenderer's terrain triangles use)
 * as a simple two-tone material, per "陣営色は建物全体から旗・装飾へ
 * 限定" — `wallLight`/`wallDark` are a natural building material (stone/
 * wood/plaster), never a faction color.
 */
function drawWalls(g: Graphics, geo: FootprintGeometry, centerX: number, groundY: number, wallLight: number, wallDark: number): void {
  poly(g, [geo.front, geo.left, geo.leftTop, geo.frontTop], centerX, groundY, wallLight);
  poly(g, [geo.front, geo.right, geo.rightTop, geo.frontTop], centerX, groundY, wallDark);
}

/** A simple hip-roof pyramid (two visible slopes meeting at a single apex) — see FootprintGeometry's doc comment. */
function drawHipRoof(g: Graphics, geo: FootprintGeometry, centerX: number, groundY: number, roofLight: number, roofDark: number): void {
  poly(g, [geo.frontTop, geo.leftTop, geo.backTop, geo.apex], centerX, groundY, roofLight);
  poly(g, [geo.frontTop, geo.rightTop, geo.backTop, geo.apex], centerX, groundY, roofDark);
}

/** A small stylized doorway — a flat dark rectangle straddling the wall seam, not skewed with the walls (a deliberate simplification, same spirit as the flag below). */
function drawDoor(g: Graphics, centerX: number, groundY: number, width: number, height: number): void {
  g.rect(centerX - width / 2, groundY - height, width, height).fill(P.ink);
}

/** A small lit window on the (left, lit) wall face. */
function drawWindow(g: Graphics, geo: FootprintGeometry, centerX: number, groundY: number, t: number, size: number): void {
  const along = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const base = along(geo.front, geo.left, t);
  const p = { x: base.x, y: base.y - size * 1.8 };
  g.rect(centerX + p.x - size / 2, groundY + p.y - size / 2, size, size).fill(P.waterLight);
}

/** The faction-accent flag — the ONLY place a house's owner is shown by color (see plan/0085). */
function drawFlag(g: Graphics, apex: Pt, centerX: number, groundY: number, factionColor: number, scale: number): void {
  const poleTop = { x: apex.x, y: apex.y - 8 * scale };
  const poleBottom = apex;
  g.moveTo(centerX + poleBottom.x, groundY + poleBottom.y)
    .lineTo(centerX + poleTop.x, groundY + poleTop.y)
    .stroke({ width: Math.max(1, scale), color: P.bronzeDark });
  const flagWidth = 6 * scale;
  const flagHeight = 4 * scale;
  g.poly([
    centerX + poleTop.x,
    groundY + poleTop.y,
    centerX + poleTop.x + flagWidth,
    groundY + poleTop.y + flagHeight / 2,
    centerX + poleTop.x,
    groundY + poleTop.y + flagHeight,
  ]).fill(factionColor);
}

/** A soft ground shadow so a house doesn't look like it's floating on the terrain mesh. */
function drawGroundShadow(g: Graphics, centerX: number, groundY: number, halfWidth: number): void {
  g.ellipse(centerX, groundY + 1, halfWidth * 0.9, halfWidth * 0.35).fill({ color: 0x000000, alpha: 0.22 });
}

/** hut/lodge/manor share this shape family: a peaked-roof cabin that grows with each level. */
function drawPeakedHouse(
  g: Graphics,
  centerX: number,
  groundY: number,
  factionColor: number,
  halfWidth: number,
  wallHeight: number,
  roofHeight: number,
  windowCount: number,
): void {
  const geo = footprint(halfWidth, wallHeight, roofHeight);
  const scale = halfWidth / 6;
  drawGroundShadow(g, centerX, groundY, halfWidth);
  drawWalls(g, geo, centerX, groundY, P.soilLight, P.soilMid);
  drawHipRoof(g, geo, centerX, groundY, P.bronzeMid, P.bronzeDark);
  drawDoor(g, centerX, groundY, 2.6 * scale, 4.5 * scale);
  for (let i = 0; i < windowCount; i++) {
    drawWindow(g, geo, centerX, groundY, 0.3 + i * 0.35, 1.6 * scale);
  }
  drawFlag(g, geo.apex, centerX, groundY, factionColor, scale);
}

/**
 * Castle gets its own silhouette rather than a bigger peaked roof — per
 * plan/0085: crenellations along the keep's top edge, plus one visibly
 * taller corner tower, so its shape (not just its size) reads as
 * different from the other 3 levels at a glance, even without labels.
 */
function drawCrenellations(g: Graphics, from: Pt, to: Pt, centerX: number, groundY: number, merlonSize: number, color: number): void {
  const merlonCount = 4;
  for (let i = 0; i < merlonCount; i++) {
    if (i % 2 !== 0) continue; // alternating merlon/gap
    const t = (i + 0.5) / merlonCount;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    g.rect(centerX + x - merlonSize / 2, groundY + y - merlonSize, merlonSize, merlonSize).fill(color);
  }
}

function drawCastle(g: Graphics, centerX: number, groundY: number, factionColor: number): void {
  const halfWidth = 15;
  const wallHeight = 13;
  const scale = halfWidth / 6;
  const geo = footprint(halfWidth, wallHeight, 0);
  drawGroundShadow(g, centerX, groundY, halfWidth * 1.15);

  // Corner tower drawn first, offset toward the back corner, so the main
  // keep (drawn on top of it below) naturally occludes the part that would
  // be hidden behind it — it should read as peeking out from behind/beside
  // the keep, not overlapping its front-facing walls.
  const towerHalfWidth = halfWidth * 0.35;
  const towerHeight = wallHeight * 1.8;
  const towerCenter = { x: geo.back.x * 0.55 - halfWidth * 0.5, y: geo.back.y * 0.55 };
  const towerGeo = footprint(towerHalfWidth, towerHeight, towerHalfWidth * 0.9);
  const towerX = centerX + towerCenter.x;
  const towerY = groundY + towerCenter.y;
  drawGroundShadow(g, towerX, towerY, towerHalfWidth);
  drawWalls(g, towerGeo, towerX, towerY, P.stoneLight, P.stoneMid);
  poly(g, [towerGeo.frontTop, towerGeo.leftTop, towerGeo.backTop, towerGeo.apex], towerX, towerY, P.bronzeMid);
  poly(g, [towerGeo.frontTop, towerGeo.rightTop, towerGeo.backTop, towerGeo.apex], towerX, towerY, P.bronzeDark);
  drawFlag(g, towerGeo.apex, towerX, towerY, factionColor, scale * 0.8);

  // Main keep: flat-topped (no peaked roof), with crenellations along both
  // visible top edges (front-left and front-right) rather than scattered
  // across the roof interior.
  drawWalls(g, geo, centerX, groundY, P.stoneLight, P.stoneMid);
  poly(g, [geo.frontTop, geo.leftTop, geo.backTop, geo.rightTop], centerX, groundY, P.stoneDark);
  drawCrenellations(g, geo.frontTop, geo.leftTop, centerX, groundY, scale * 2.2, P.stoneShadow);
  drawCrenellations(g, geo.frontTop, geo.rightTop, centerX, groundY, scale * 2.2, P.stoneShadow);
  drawDoor(g, centerX, groundY, 4 * scale, 6 * scale);
  drawWindow(g, geo, centerX, groundY, 0.25, 2 * scale);
  drawWindow(g, geo, centerX, groundY, 0.7, 2 * scale);
}

/** On-screen half-width (px) per level — castle is deliberately a full tier bigger, per plan/0085. */
const HOUSE_HALF_WIDTH: Record<HouseLevel, number> = { hut: 6, lodge: 8, manor: 10, castle: 15 };

/**
 * Draws an isometric house — a two-wall-face-plus-roof box matching the
 * terrain's own projection angle and fixed-light-source shading, instead
 * of the previous flat front-facing pixel-pattern square. `factionColor`
 * is used ONLY for the roof-top flag (see drawFlag) — the building
 * material itself (stone/wood tones) never changes with ownership, per
 * plan/0085-isometric-house-sprites.md.
 */
export function drawHouseSprite(g: Graphics, centerX: number, groundY: number, level: HouseLevel, factionColor: number): void {
  if (level === "castle") {
    drawCastle(g, centerX, groundY, factionColor);
    return;
  }
  const halfWidth = HOUSE_HALF_WIDTH[level];
  const wallHeight = level === "hut" ? halfWidth : halfWidth * 1.05;
  const roofHeight = halfWidth * (level === "hut" ? 0.7 : 0.6);
  const windowCount = level === "hut" ? 0 : level === "lodge" ? 1 : 2;
  drawPeakedHouse(g, centerX, groundY, factionColor, halfWidth, wallHeight, roofHeight, windowCount);
}
