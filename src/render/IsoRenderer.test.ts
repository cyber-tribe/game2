import { Graphics, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";
import {
  IsoRenderer,
  TILE_HEIGHT,
  TILE_WIDTH,
  isWithinTileBounds,
  visibleTileBounds,
  volcanoGlowIntensity,
  type TileBounds,
} from "./IsoRenderer";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, waterLevel: 0 };
}

/**
 * The rendered fill/stroke/etc instructions Pixi's Graphics recorded for
 * this renderer's current redraw() — the only way to inspect the terraced
 * geometry (top faces + cliff walls) without a real canvas. See
 * plan/0064-terraced-terrain.md for why redraw() renders this way.
 */
function drawInstructions(renderer: IsoRenderer) {
  // @ts-expect-error -- graphics is a private implementation detail; reached
  // into here specifically because Pixi's Graphics builds real instruction
  // data even without a canvas (see the module-level comment in this file).
  return renderer.graphics.context.instructions as {
    action: string;
    data: { style?: { color: number; texture?: Texture } };
  }[];
}

function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

describe("IsoRenderer.update", () => {
  it("eases the displayed terrain height toward the real height gradually instead of snapping", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    // @ts-expect-error -- displayVertices is a private implementation detail; reached into here
    // specifically to verify the easing behavior redraw() alone can't expose without a canvas.
    const display = () => renderer.displayVertices[2][2] as number;

    expect(display()).toBe(5);
    heightmap.vertices[2][2] = 6;

    const steps: number[] = [];
    for (let i = 0; i < 10; i++) {
      renderer.update(1 / 60);
      steps.push(display());
    }

    expect(steps.every((v, i) => i === 0 || v >= steps[i - 1])).toBe(true);
    expect(steps.every((v) => v <= 6)).toBe(true);
    expect(steps[0]).toBeLessThan(5.9);
    expect(Math.abs(steps[steps.length - 1] - 6)).toBeLessThan(0.05);
  });
});

describe("IsoRenderer.isAnimating", () => {
  const WHOLE_4X4: TileBounds = { minX: 0, maxX: 3, minY: 0, maxY: 3 };

  it("is false for a flat, unedited, lava-free map", () => {
    const renderer = new IsoRenderer(flatHeightmap(4, 4, 5));
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(false);
  });

  it("turns true while an edit is still easing in, and false again once it settles", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    heightmap.vertices[2][2] = 6;

    expect(renderer.isAnimating(WHOLE_4X4)).toBe(true);
    for (let i = 0; i < 30; i++) renderer.update(1 / 60);
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(false);
  });

  it("ignores an in-progress ease outside the given bounds", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    heightmap.vertices[3][3] = 6; // touches only tile (2,2) and (3,3), not the (0,0) corner below

    expect(renderer.isAnimating({ minX: 0, maxX: 0, minY: 0, maxY: 0 })).toBe(false);
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(true);
  });

  it("turns true once redraw() finds glowing lava within its bounds, and false again once it's fully cooled", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    heightmap.rockHardness[1][1] = VOLCANO_ROCK_HARDNESS;
    const renderer = new IsoRenderer(heightmap); // constructor already calls redraw() over the whole map

    expect(renderer.isAnimating(WHOLE_4X4)).toBe(true);

    heightmap.rockHardness[1][1] = 0;
    renderer.redraw();
    expect(renderer.isAnimating(WHOLE_4X4)).toBe(false);
  });

  it("only reflects lava within the last-drawn bounds, not the whole map", () => {
    const heightmap = flatHeightmap(10, 10, 5);
    heightmap.rockHardness[8][8] = VOLCANO_ROCK_HARDNESS; // outside the bounds redrawn below
    const renderer = new IsoRenderer(heightmap);
    const nearCorner: TileBounds = { minX: 0, maxX: 2, minY: 0, maxY: 2 };
    const farCorner: TileBounds = { minX: 6, maxX: 9, minY: 6, maxY: 9 };

    renderer.redraw(nearCorner);
    expect(renderer.isAnimating(nearCorner)).toBe(false);

    renderer.redraw(farCorner);
    expect(renderer.isAnimating(farCorner)).toBe(true);
  });
});

describe("IsoRenderer.redraw with bounds", () => {
  it("draws far fewer tile quads when given a small bounds than the whole map", () => {
    const heightmap = flatHeightmap(40, 40, 5);
    const renderer = new IsoRenderer(heightmap);
    const polySpy = vi.spyOn(Graphics.prototype, "poly");

    polySpy.mockClear();
    renderer.redraw(); // whole map: 40*40 = 1600 tile-top quads, plus a
    // perimeter of cliff-wall quads down to the map's off-edge sea level
    // (see IsoRenderer's terraced rendering — plan/0064-terraced-terrain.md)
    const fullMapCalls = polySpy.mock.calls.length;

    polySpy.mockClear();
    renderer.redraw({ minX: 10, maxX: 14, minY: 10, maxY: 14 }); // 5*5 = 25 tile-top quads, no walls (flat, interior)
    const boundedCalls = polySpy.mock.calls.length;

    expect(fullMapCalls).toBeGreaterThan(1600);
    expect(boundedCalls).toBe(25);
    expect(boundedCalls).toBeLessThan(fullMapCalls);
    polySpy.mockRestore();
  });
});

/** toScreen(x, y, 0) — the same projection visibleTileBounds inverts. */
function toScreenFlat(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_WIDTH / 2), y: (x + y) * (TILE_HEIGHT / 2) };
}

describe("visibleTileBounds", () => {
  it("round-trips a single corner back to its own tile, with no margin", () => {
    const bounds = visibleTileBounds([toScreenFlat(10, 6)], 64, 64, 0);
    expect(bounds).toEqual({ minX: 10, maxX: 10, minY: 6, maxY: 6 });
  });

  it("covers every corner of a screen rectangle, not just the first", () => {
    const corners = [toScreenFlat(5, 5), toScreenFlat(20, 5), toScreenFlat(20, 20), toScreenFlat(5, 20)];
    const bounds = visibleTileBounds(corners, 64, 64, 0);
    expect(bounds).toEqual({ minX: 5, maxX: 20, minY: 5, maxY: 20 });
  });

  it("pads the exact bounds by the given margin", () => {
    const bounds = visibleTileBounds([toScreenFlat(10, 10)], 64, 64, 3);
    expect(bounds).toEqual({ minX: 7, maxX: 13, minY: 7, maxY: 13 });
  });

  it("clamps to the map's own bounds instead of returning negative or out-of-range tiles", () => {
    const bounds = visibleTileBounds([toScreenFlat(0, 0)], 20, 20, 5);
    expect(bounds).toEqual({ minX: 0, maxX: 5, minY: 0, maxY: 5 });

    const farCorner = visibleTileBounds([toScreenFlat(19, 19)], 20, 20, 5);
    expect(farCorner).toEqual({ minX: 14, maxX: 19, minY: 14, maxY: 19 });
  });
});

describe("isWithinTileBounds", () => {
  const bounds: TileBounds = { minX: 5, maxX: 10, minY: 5, maxY: 10 };

  it("is true for a point in the middle of the bounds", () => {
    expect(isWithinTileBounds({ x: 7.5, y: 7.5 }, bounds)).toBe(true);
  });

  it("is true right at minX/minY", () => {
    expect(isWithinTileBounds({ x: 5, y: 5 }, bounds)).toBe(true);
  });

  it("is true on the far vertex of the last visible tile (maxX + 1 / maxY + 1)", () => {
    expect(isWithinTileBounds({ x: 11, y: 11 }, bounds)).toBe(true);
  });

  it("is false just past the far vertex", () => {
    expect(isWithinTileBounds({ x: 11.01, y: 7 }, bounds)).toBe(false);
    expect(isWithinTileBounds({ x: 7, y: 11.01 }, bounds)).toBe(false);
  });

  it("is false just before minX/minY", () => {
    expect(isWithinTileBounds({ x: 4.99, y: 7 }, bounds)).toBe(false);
    expect(isWithinTileBounds({ x: 7, y: 4.99 }, bounds)).toBe(false);
  });
});

describe("IsoRenderer.redraw (terraced blocks)", () => {
  it("draws each tile as a top fill + stroke and no cliff walls when everything is at sea level", () => {
    // Elevation 0 matches heightAt's off-the-map default (see redraw()'s
    // heightAt), so even the map's true edges see no height difference.
    const heightmap = flatHeightmap(4, 4, 0);
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    expect(instructions).toHaveLength(4 * 4 * 2);
    expect(instructions.filter((i) => i.action === "fill")).toHaveLength(4 * 4);
    expect(instructions.filter((i) => i.action === "stroke")).toHaveLength(4 * 4);
  });

  it("draws extra cliff-wall fills once part of the map sits higher than the rest", () => {
    const heightmap = flatHeightmap(5, 5, 0);
    const flatFillCount = drawInstructions(new IsoRenderer(heightmap)).filter((i) => i.action === "fill").length;

    // Raising every corner of the interior tile (2,2) also partially lifts
    // its neighbors' averaged heights (see redraw()'s tileElevation —
    // corners are shared, so a single tile's bump ripples into how flat
    // its neighbors read too), so this isn't just 4 clean new walls — but
    // it must be strictly more than the perfectly flat baseline above.
    heightmap.vertices[2][2] = 4;
    heightmap.vertices[2][3] = 4;
    heightmap.vertices[3][2] = 4;
    heightmap.vertices[3][3] = 4;
    const raisedFillCount = drawInstructions(new IsoRenderer(heightmap)).filter((i) => i.action === "fill").length;

    expect(raisedFillCount).toBeGreaterThan(flatFillCount);
  });

  it("rounds a tile's rendered elevation to VISUAL_ELEVATION_BUCKET, merging small differences into the same flat plateau", () => {
    // A 4x4 map, uniformly elevation 4 (bucketed elevation is also 4, since
    // it's already an even multiple of VISUAL_ELEVATION_BUCKET=2).
    const baseline = flatHeightmap(4, 4, 4);
    const baselineFillCount = drawInstructions(new IsoRenderer(baseline)).filter((i) => i.action === "fill").length;

    // Nudging one corner of tile (1, 1) up by 1 raises its raw average to
    // 4.25 — still within the same rounded-to-4 bucket as its flat
    // neighbors, so no new wall should appear at all: this is exactly the
    // "routine 1-unit worldgen noise" VISUAL_ELEVATION_BUCKET exists to
    // hide (see its own doc comment).
    const nudged = flatHeightmap(4, 4, 4);
    nudged.vertices[1][1] = 5;
    const nudgedFillCount = drawInstructions(new IsoRenderer(nudged)).filter((i) => i.action === "fill").length;
    expect(nudgedFillCount).toBe(baselineFillCount);

    // Raising that same corner enough to push the tile's raw average past
    // the next bucket boundary (4.25 -> 5.25, rounding to 6 instead of 4)
    // does still show real walls — VISUAL_ELEVATION_BUCKET hides routine
    // noise, not genuine elevation differences.
    const raised = flatHeightmap(4, 4, 4);
    raised.vertices[1][1] = 9;
    const raisedFillCount = drawInstructions(new IsoRenderer(raised)).filter((i) => i.action === "fill").length;
    expect(raisedFillCount).toBeGreaterThan(baselineFillCount);
  });

  it("shades a cliff wall darker than the top it descends from, in one of two directional tones", () => {
    // Desert, not grass: grass tops are dithered (see GRASS_FILL) rather
    // than a plain color, which this test isn't about — wall shading
    // itself is the same darkening regardless of which terrain it's on.
    // A uniform flat map relies purely on the map's own off-edge default
    // (elevation 0) for its cliffs, rather than raising an interior patch
    // — raising a patch also partially lifts its neighbors' own averaged
    // heights (see the "draws extra cliff-wall fills..." test above), which
    // would give some walls here a smaller, proportionally-scaled-down
    // drop (see CLIFF_FULL_SHADE_DROP) instead of the single clean, fully
    // capped magnitude this test wants.
    const heightmap = flatHeightmap(3, 3, 5);
    heightmap.terrain = "desert";
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    const colors = new Set(instructions.filter((i) => i.action === "fill").map((i) => i.data.style!.color));

    // Every tile here is plain desert (elevation is above waterLevel 0 and
    // none of it is volcano rock), so every top fills with TERRAIN_COLOR.
    // desert. Every tile borders the map edge on at least one side, so
    // every wall shades that same color down from the same elevation-5
    // drop, toward one of two tones depending on which way it faces (see
    // drawCliffWalls' doc comment on the fixed light direction) — exactly
    // 3 distinct colors total: the top, plus a lit and a shadowed wall tone.
    const DESERT = 0xd6b25e;
    expect(colors.has(DESERT)).toBe(true);
    expect(colors.size).toBe(3);

    const [tr, tg, tb] = channels(DESERT);
    for (const wallColor of colors) {
      if (wallColor === DESERT) continue;
      const [wr, wg, wb] = channels(wallColor);
      expect(wr).toBeLessThan(tr);
      expect(wg).toBeLessThan(tg);
      expect(wb).toBeLessThan(tb);
    }
  });

  it("shades a grass cliff wall from an earthy tone instead of grass's own green", () => {
    // A darkened copy of grass's own green landed almost exactly on
    // GRASS_SPECKLE_COLOR's own dark speckle pixels — see GRASS_CLIFF_
    // COLOR's doc comment — so a grass cliff shades from a dedicated
    // brown base instead, a hue change rather than just a darker green.
    // Uniform + map-edge-only for the same reason as the desert test above.
    const heightmap = flatHeightmap(3, 3, 5); // grass by default
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);

    // Grass tops fill with GRASS_FILL's own dither texture; walls are still
    // plain color fills carrying Pixi's default white texture (see the
    // dither test below) — this isolates the walls from the tops.
    const wallColors = new Set(
      instructions
        .filter((i) => i.action === "fill" && i.data.style!.texture === Texture.WHITE)
        .map((i) => i.data.style!.color),
    );
    // Both directional tones (see drawCliffWalls) are earthy — 2 distinct
    // wall colors, not 1, since this scene has walls facing every direction.
    expect(wallColors.size).toBe(2);

    for (const wallColor of wallColors) {
      const [wr, wg, wb] = channels(wallColor);
      // A darkened grass green keeps green as the dominant channel; an
      // earthy brown instead has red at least as strong as green.
      expect(wr).toBeGreaterThanOrEqual(wg);
      expect(wg).toBeGreaterThan(wb);
    }
  });

  it("shades the north/east walls of a raised tile lighter than its south/west walls", () => {
    // A single-tile map borders the (off-edge, elevation 0) map default on
    // all 4 sides — the simplest possible scene with all 4 wall directions
    // present, at one single clean drop magnitude, and with no other tile
    // around to produce a wall whose screen position could coincidentally
    // collide with one of these 4 (toScreen's projection can otherwise map
    // distinct (x, y, elevation) triples onto the same screen point).
    const heightmap = flatHeightmap(1, 1, 9);
    heightmap.terrain = "desert";
    const renderer = new IsoRenderer(heightmap);
    const fills = drawInstructions(renderer).filter((i) => i.action === "fill");
    expect(fills).toHaveLength(5); // 1 top + 4 walls

    // redraw() fills a tile's own top first, then calls drawCliffWalls,
    // which itself always calls addWall in north/east/south/west order
    // (see its own body) — a stable enough contract for this single-tile
    // scene to just read the walls off by position instead of hunting for
    // each one by its screen geometry (north's own first point coincides
    // with the top's own first point, since both start at this tile's
    // (x, y) corner — geometry alone can't tell them apart here).
    const [, north, east, south, west] = fills.map((f) => f.data.style!.color);

    expect(north).toBe(east);
    expect(south).toBe(west);
    expect(north).not.toBe(south);

    const [nr, ng, nb] = channels(north);
    const [sr, sg, sb] = channels(south);
    expect(nr).toBeGreaterThan(sr);
    expect(ng).toBeGreaterThan(sg);
    expect(nb).toBeGreaterThan(sb);
  });

  it("shades a small drop much more subtly than a full-strength cliff", () => {
    // createHeightmap's own generation noise (see its doc comment) makes a
    // small step between adjacent tiles routine, not a deliberate feature
    // — rendering it at the same full darkness as a real multi-unit cliff
    // (a volcano, an earthquake, several taps of terraforming) painted
    // almost the entire map in bold cliff faces. See CLIFF_FULL_SHADE_DROP.
    const southWallDistanceFromTop = (elevation: number): number => {
      const heightmap = flatHeightmap(1, 1, elevation);
      heightmap.terrain = "desert";
      const fills = drawInstructions(new IsoRenderer(heightmap)).filter((i) => i.action === "fill");
      const [top, , , south] = fills.map((f) => f.data.style!.color);
      const [tr, tg, tb] = channels(top);
      const [sr, sg, sb] = channels(south);
      return tr - sr + (tg - sg) + (tb - sb);
    };

    // 2, not 1: VISUAL_ELEVATION_BUCKET rounds every rendered elevation to
    // an even number first, so 2 units — one bucket step, the smallest gap
    // between two adjacent terrace levels — is the smallest drop that can
    // ever actually render; CLIFF_FULL_SHADE_DROP holds it at half
    // strength rather than full.
    const smallDrop = southWallDistanceFromTop(2);
    const fullDrop = southWallDistanceFromTop(9); // well past CLIFF_FULL_SHADE_DROP — a real cliff

    expect(smallDrop).toBeGreaterThan(0); // still visibly darker than the top, not invisible
    // ~half of fullDrop, give or take integer-channel rounding in lerpColor.
    expect(smallDrop).toBeLessThanOrEqual(fullDrop / 2 + 1);
  });

  it("dithers grass tops with the speckled texture instead of a flat color", () => {
    // Elevation 0 matches heightAt's off-the-map default, so no cliff
    // walls appear at the map's true edges — every fill here is a tile top.
    const heightmap = flatHeightmap(3, 3, 0); // flatHeightmap defaults to grass terrain
    heightmap.waterLevel = -1; // land despite elevation 0 — see isBuildable's own use of waterLevel
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    const tops = instructions.filter((i) => i.action === "fill");

    expect(tops).toHaveLength(3 * 3);
    for (const top of tops) {
      // A plain color fill (drawCliffWalls' walls, or a non-grass terrain's
      // top) still carries Pixi's own default 1x1 white texture — real
      // texture fills are the only ones that replace it with something else.
      expect(top.data.style!.texture).not.toBe(Texture.WHITE);
    }
  });

  it("does not draw a wall for a sub-threshold height difference (easing noise)", () => {
    const heightmap = flatHeightmap(3, 3, 0);
    // Just under CLIFF_MIN_STEP, and above sea level itself — should read
    // as flat, not a tiny cliff.
    heightmap.vertices[1][1] = 0.02;
    heightmap.vertices[1][2] = 0.02;
    heightmap.vertices[2][1] = 0.02;
    heightmap.vertices[2][2] = 0.02;
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    expect(instructions.filter((i) => i.action === "fill")).toHaveLength(3 * 3);
  });

  it("still draws a cliff wall down to sea level at the edge of the map", () => {
    // A tile at the very corner of the map has no real neighbor on 2 of
    // its sides — those should still get a wall down to height 0, like
    // the edge of a diorama base, rather than nothing.
    const heightmap = flatHeightmap(2, 2, 8);
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    // Every one of the 4 tiles borders the map edge on at least 2 sides
    // and none of them differ from each other, so all their walls come
    // from those map-edge sides: 4 tops + 4*2 edge walls.
    const fills = instructions.filter((i) => i.action === "fill");
    expect(fills.length).toBeGreaterThan(2 * 2);
  });
});

describe("IsoRenderer.pickTile", () => {
  it("picks the tile whose center is closest to the tapped point", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    const center = renderer.project(2.5, 2.5); // exact center of tile (2, 2)

    expect(renderer.pickTile(center.sx, center.sy)).toEqual({ x: 2, y: 2 });
  });

  it("returns a whole tile even when the tap lands off-center within it", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);
    const center = renderer.project(2.5, 2.5);

    // A few screen px off the exact center — still well within tile (2, 2),
    // nowhere near tile (1, 1) or (3, 3)'s own centers.
    expect(renderer.pickTile(center.sx + 5, center.sy + 3)).toEqual({ x: 2, y: 2 });
  });

  it("returns null past maxDistance from every tile center", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    const renderer = new IsoRenderer(heightmap);

    expect(renderer.pickTile(10_000, 10_000)).toBeNull();
  });

  it("follows a raised tile's own elevation, not the flat (elevation-0) projection", () => {
    const heightmap = flatHeightmap(4, 4, 0);
    heightmap.vertices[2][2] = 10;
    heightmap.vertices[2][3] = 10;
    heightmap.vertices[3][2] = 10;
    heightmap.vertices[3][3] = 10;
    const renderer = new IsoRenderer(heightmap);

    // toScreen(2.5, 2.5, 0) would land well below where the raised tile's
    // face (toScreen(2.5, 2.5, 10)) actually renders on screen — picking
    // must follow the real elevation, not assume everything is flat.
    const raisedCenter = renderer.project(2.5, 2.5);
    expect(renderer.pickTile(raisedCenter.sx, raisedCenter.sy)).toEqual({ x: 2, y: 2 });
  });
});

describe("volcanoGlowIntensity", () => {
  it("is zero once rockHardness has fully cooled, regardless of the pulse phase", () => {
    for (let t = 0; t < 3; t += 0.3) {
      expect(volcanoGlowIntensity(0, VOLCANO_ROCK_HARDNESS, t, 0.5)).toBe(0);
    }
  });

  it("glows brighter, on average, the more rockHardness is left", () => {
    // Average over a full pulse cycle to compare base brightness levels
    // without the pulse itself (see LAVA_PULSE_SPEED) muddying the comparison.
    const averageOver = (hardness: number) => {
      let sum = 0;
      const samples = 20;
      for (let i = 0; i < samples; i++) {
        sum += volcanoGlowIntensity(hardness, VOLCANO_ROCK_HARDNESS, (i / samples) * (2 * Math.PI), 0);
      }
      return sum / samples;
    };

    expect(averageOver(VOLCANO_ROCK_HARDNESS)).toBeGreaterThan(averageOver(VOLCANO_ROCK_HARDNESS / 2));
    expect(averageOver(VOLCANO_ROCK_HARDNESS / 2)).toBeGreaterThan(averageOver(0));
  });

  it("pulses over time rather than sitting at a flat brightness", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 3; t += 0.1) {
      seen.add(Math.round(volcanoGlowIntensity(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS, t, 0) * 100));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("gives two tiles different pulse phases so they don't flicker in unison", () => {
    const a = volcanoGlowIntensity(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS, 1.23, 0.1);
    const b = volcanoGlowIntensity(VOLCANO_ROCK_HARDNESS, VOLCANO_ROCK_HARDNESS, 1.23, 0.7);
    expect(a).not.toBeCloseTo(b, 5);
  });

  it("gives the same inputs the same result (deterministic, not tied to draw order)", () => {
    expect(volcanoGlowIntensity(9, 20, 1.5, 0.3)).toBe(volcanoGlowIntensity(9, 20, 1.5, 0.3));
  });
});
