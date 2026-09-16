import { Graphics, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { REEF_HARDNESS, VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";
import {
  EDGE_STRATA,
  IsoRenderer,
  TILE_HEIGHT,
  TILE_WIDTH,
  faceBrightnessOf,
  heightTint,
  isWithinTileBounds,
  turfFillFor,
  visibleTileBounds,
  volcanoGlowIntensity,
  waterFrameIndex,
  type TileBounds,
  type Vec3,
} from "./IsoRenderer";
function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, forest: blankLayer(width, height),
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), wall: blankLayer(width, height), boulder: blankLayer(width, height), waterLevel: 0 };
}

/**
 * The rendered fill/stroke/etc instructions Pixi's Graphics recorded for
 * this renderer's current redraw() — the only way to inspect the per-vertex
 * mesh geometry (sloped/shaded triangles, plus the map's own edge walls)
 * without a real canvas. See IsoRenderer's own class doc comment for why
 * redraw() renders this way.
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

/** The single turf texture tile (2, 2) is painted with. */
function turfOf(heightmap: Heightmap): Texture {
  const renderer = new IsoRenderer(heightmap);
  renderer.redraw({ minX: 2, maxX: 2, minY: 2, maxY: 2 });
  const [fill] = drawInstructions(renderer).filter((i) => i.action === "fill");
  return fill.data.style!.texture!;
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
  it("draws far fewer squares when given a small, edge-free bounds than the whole map", () => {
    const heightmap = flatHeightmap(40, 40, 5);
    const renderer = new IsoRenderer(heightmap);
    const polySpy = vi.spyOn(Graphics.prototype, "poly");

    polySpy.mockClear();
    renderer.redraw(); // whole map: one square per tile (see fillTerrainQuad),
    // plus a perimeter of vertical walls along the map's own outer edge
    // (see drawEdgeWall) — an interior height difference never draws one.
    const fullMapCalls = polySpy.mock.calls.length;

    polySpy.mockClear();
    renderer.redraw({ minX: 10, maxX: 14, minY: 10, maxY: 14 }); // 5*5 interior tiles, no map edges crossed
    const boundedCalls = polySpy.mock.calls.length;

    expect(fullMapCalls).toBeGreaterThan(40 * 40);
    expect(boundedCalls).toBe(5 * 5);
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

describe("IsoRenderer.redraw (sloped mesh)", () => {
  it("draws each tile as a single flat, unshaded quad (no stroke) when everything is at sea level", () => {
    // Elevation 0 matches flatHeightmap's own default waterLevel (0), so
    // every tile here is water — always a flat quad, never split into
    // sloped triangles (see redraw()'s isWater branch) — and no edge walls
    // either, since there's nothing above sea level to drop down from.
    // No stroke anywhere either — see fillTerrainTriangle's own doc
    // comment on why every tile seam used to get outlined regardless of
    // whether its neighbor was the same color, drawing a distracting
    // wireframe grid over otherwise-uniform ground.
    const heightmap = flatHeightmap(4, 4, 0);
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    expect(instructions).toHaveLength(4 * 4);
    expect(instructions.filter((i) => i.action === "fill")).toHaveLength(4 * 4);
    expect(instructions.filter((i) => i.action === "stroke")).toHaveLength(0);
  });

  it("fills water with an animated wave texture instead of a flat color", () => {
    const heightmap = flatHeightmap(2, 2, 0); // == default waterLevel 0, so every tile is water
    const renderer = new IsoRenderer(heightmap);
    const fills = drawInstructions(renderer).filter((i) => i.action === "fill");

    expect(fills).toHaveLength(2 * 2);
    for (const fill of fills) {
      expect(fill.data.style!.texture).not.toBe(Texture.WHITE);
    }
  });

  it("turns neighboring underwater tiles into dry land once a patch is raised", () => {
    // Water and land are both one square per tile now (see fillTerrainQuad),
    // so the fill *count* no longer moves — what changes is what those
    // squares are filled with. An all-water map is one repeated wave frame;
    // dry land brings in its terrain's own dither and the plain shaded
    // colors of slopes.
    const fillsFor = (heightmap: Heightmap) =>
      drawInstructions(new IsoRenderer(heightmap)).filter((i) => i.action === "fill");

    const heightmap = flatHeightmap(5, 5, 0); // every tile starts as water (elevation 0 == waterLevel 0)
    const beforeFills = fillsFor(heightmap);
    expect(beforeFills).toHaveLength(5 * 5);
    expect(new Set(beforeFills.map((f) => f.data.style!.texture)).size).toBe(1);

    // Raising every corner of the interior tile (2,2) also partially lifts
    // its neighbors' averaged heights (corners are shared), pushing some of
    // them from water into dry land — with no vertical wall anywhere, since
    // none of this touches the map's own outer edge.
    heightmap.vertices[2][2] = 4;
    heightmap.vertices[2][3] = 4;
    heightmap.vertices[3][2] = 4;
    heightmap.vertices[3][3] = 4;

    const afterFills = fillsFor(heightmap);
    expect(afterFills).toHaveLength(5 * 5); // still exactly one square per tile
    expect(new Set(afterFills.map((f) => f.data.style!.texture)).size).toBeGreaterThan(1);
  });

  /**
   * The cut side of the world is earth, not the surface extruded: the
   * original's slab shows a light band under the rim, browner ground below
   * it, and near-black rock at the bottom, whatever is growing on top.
   * Painting it in the terrain's own color made a green field a world of
   * grass all the way down.
   */
  it("paints the map-edge wall in earth strata rather than the terrain's own color", () => {
    const wallColorsFor = (terrain: Heightmap["terrain"]) => {
      const heightmap = flatHeightmap(3, 3, 5);
      heightmap.terrain = terrain;
      const renderer = new IsoRenderer(heightmap);
      const fills = drawInstructions(renderer).filter((i) => i.action === "fill");
      return new Set(fills.filter((f) => f.data.style!.texture === Texture.WHITE).map((f) => f.data.style!.color));
    };

    const desert = wallColorsFor("desert");
    // Three strata (see EDGE_STRATA), each in one of two directional tones
    // (see drawEdgeWall's fixed outward normal per direction).
    expect(desert.size).toBe(EDGE_STRATA.length * 2);

    // The same earth under every surface: what a stage grows on top does not
    // change what it is made of underneath. Extruding the surface color gave
    // each terrain its own coloured underside, which is the bug.
    expect(wallColorsFor("grass")).toEqual(desert);
    expect(wallColorsFor("snow")).toEqual(desert);
    expect(wallColorsFor("rock")).toEqual(desert);
  });

  it("shades a map-edge wall darker than the flat top it descends from, in one of two directional tones", () => {
    // A uniform flat map relies purely on the map's own true outer edge for
    // its walls — every interior tile boundary here is perfectly flat and
    // gets no wall at all.
    const heightmap = flatHeightmap(3, 3, 5);
    heightmap.terrain = "desert";
    const renderer = new IsoRenderer(heightmap);
    const fills = drawInstructions(renderer).filter((i) => i.action === "fill");

    // Every tile's own flat top is dithered (see TERRAIN_FILL) rather than
    // a plain color — not what this test is about — so walls are singled
    // out by their plain Texture.WHITE fill (see the dithering tests below)
    // rather than by position, since redraw() interleaves each tile's own
    // walls right after its top square instead of drawing all walls last. Only tile (1,1) has no map-edge wall; every other tile borders
    // the map's true edge on at least one side, shading toward one of two
    // tones depending on which way it faces (see drawEdgeWall's fixed
    // outward normal per direction) — exactly 2 distinct wall colors.
    const wallColors = new Set(
      fills.filter((f) => f.data.style!.texture === Texture.WHITE).map((f) => f.data.style!.color),
    );
    expect(wallColors.size).toBe(EDGE_STRATA.length * 2);

    // Every band is a *shaded* version of its own stratum: a vertical face
    // never comes out at full brightness, whichever way it looks.
    for (const wallColor of wallColors) {
      const stratum = EDGE_STRATA.find((band) => {
        const [br, bg, bb] = channels(band.color);
        const [wr, wg, wb] = channels(wallColor);
        return wr <= br && wg <= bg && wb <= bb;
      });
      expect(stratum).toBeDefined();
      expect(wallColor).not.toBe(stratum!.color);
    }
  });

  it("shades the north/east map-edge walls of a raised tile lighter than its south/west walls", () => {
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
    // 1 flat top square + 4 edge walls, each in EDGE_STRATA bands.
    expect(fills).toHaveLength(1 + 4 * EDGE_STRATA.length);

    // redraw() fills a tile's own square first, then always draws its
    // 4 edge walls in north/east/south/west order (see its own body) — a
    // stable enough contract for this single-tile scene to just read the
    // walls off by position instead of hunting for each one by its screen
    // geometry (a wall's own first point can coincide with another fill's,
    // since toScreen can map distinct (x, y, elevation) triples onto the
    // same screen point).
    const colors = fills.map((f) => f.data.style!.color);
    // The topmost band of each wall, in north/east/south/west order.
    const bandsPerWall = EDGE_STRATA.length;
    const [north, east, south, west] = [0, 1, 2, 3].map((i) => colors[1 + i * bandsPerWall]);

    expect(north).toBe(east);
    expect(south).toBe(west);
    expect(north).not.toBe(south);

    const [nr, ng, nb] = channels(north);
    const [sr, sg, sb] = channels(south);
    expect(nr).toBeGreaterThan(sr);
    expect(ng).toBeGreaterThan(sg);
    expect(nb).toBeGreaterThan(sb);
  });

  it("draws an interior slope as one square, never a vertical wall", () => {
    const heightmap = flatHeightmap(6, 6, 5); // big enough that tile (2,2) sits nowhere near the map's own edge
    heightmap.vertices[2][2] += 4;
    const renderer = new IsoRenderer(heightmap);
    renderer.redraw({ minX: 2, maxX: 2, minY: 2, maxY: 2 }); // isolates tile (2,2)'s own draws

    expect(drawInstructions(renderer).filter((i) => i.action === "fill")).toHaveLength(1);
  });

  it("shades a tile by its slope and its height together", () => {
    const tileCorners = (heightmap: Heightmap, x: number, y: number): Vec3[] => [
      { x, y, z: heightmap.vertices[y][x] },
      { x: x + 1, y, z: heightmap.vertices[y][x + 1] },
      { x: x + 1, y: y + 1, z: heightmap.vertices[y + 1][x + 1] },
      { x, y: y + 1, z: heightmap.vertices[y + 1][x] },
    ];
    const averageZ = (corners: Vec3[]): number => corners.reduce((sum, c) => sum + c.z, 0) / corners.length;

    // Level ground carries no slope shading at all, so its height is the
    // only thing left to say about it.
    const flat = flatHeightmap(6, 6, 5);
    flat.terrain = "desert";
    expect(turfOf(flat)).toBe(turfFillFor("desert", heightTint(5)).texture);

    const sloped = flatHeightmap(6, 6, 5);
    sloped.terrain = "desert";
    sloped.vertices[2][2] += 4;
    const corners = tileCorners(sloped, 2, 2);
    expect(turfOf(sloped)).toBe(
      turfFillFor("desert", faceBrightnessOf(corners) * heightTint(averageZ(corners))).texture,
    );
    expect(turfOf(sloped)).not.toBe(turfOf(flat));
  });

  /**
   * The whole point of the height tint, per feedback: 「高度が読み取りに
   * くいです。上なのか下なのか分かりにくいので、平坦にするためには上げ
   * たら良いのか下げたら良いのかがわからない」. Two level plateaus are
   * equally flat, so Lambert shading has nothing to say about either, and
   * they used to be drawn pixel-identical — leaving vertical screen
   * position, which an isometric view cannot tell apart from depth, as the
   * only cue.
   */
  it("draws two level plateaus at different heights in different shades, lighter higher", () => {
    const low = flatHeightmap(6, 6, 2);
    const high = flatHeightmap(6, 6, 8);

    expect(turfOf(low)).not.toBe(turfOf(high));
    expect(heightTint(8)).toBeGreaterThan(heightTint(2));
  });

  it("dithers a flat grass square with the speckled texture instead of a flat color", () => {
    const heightmap = flatHeightmap(3, 3, 0); // flatHeightmap defaults to grass terrain
    heightmap.waterLevel = -1; // land despite elevation 0 — see isBuildable's own use of waterLevel
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    const tops = instructions.filter((i) => i.action === "fill");

    expect(tops).toHaveLength(3 * 3); // one dithered square per land tile
    for (const top of tops) {
      // A plain color fill (a map-edge wall, or a sloped/non-grass tile)
      // still carries Pixi's own default 1x1 white texture — a real
      // texture fill (GRASS_FILL) is the only kind that replaces it.
      expect(top.data.style!.texture).not.toBe(Texture.WHITE);
    }
  });

  it.each(["desert", "snow", "rock"] as const)("dithers a flat %s square too, not just grass", (terrain) => {
    const heightmap = flatHeightmap(3, 3, 0); // elevation 0 draws no walls (see drawEdgeWall's own FLAT_EPSILON check)
    heightmap.terrain = terrain;
    heightmap.waterLevel = -1; // land despite elevation 0
    const renderer = new IsoRenderer(heightmap);
    const tops = drawInstructions(renderer).filter((i) => i.action === "fill");

    expect(tops).toHaveLength(3 * 3);
    for (const top of tops) {
      expect(top.data.style!.texture).not.toBe(Texture.WHITE);
    }
  });

  /**
   * The reference art has no flat colour anywhere on its land — only turf
   * catching more or less light. Ordinary ground used to lose its texture
   * the moment it stopped being level, which on rolling terrain meant most
   * of the map was plain colour.
   */
  it("textures every ordinary ground square, however steep — plain colour is left to walls and rock", () => {
    const heightmap = flatHeightmap(6, 6, 5); // grass by default; big enough for edge-free interior tiles
    heightmap.vertices[2][2] += 3;
    heightmap.vertices[3][3] += 2;
    heightmap.vertices[2][3] -= 1;
    const renderer = new IsoRenderer(heightmap);
    renderer.redraw({ minX: 1, maxX: 4, minY: 1, maxY: 4 }); // interior only: no map-edge walls
    const fills = drawInstructions(renderer).filter((i) => i.action === "fill");

    expect(fills).toHaveLength(4 * 4);
    for (const fill of fills) {
      expect(fill.data.style!.texture).not.toBe(Texture.WHITE);
    }
  });

  it("still draws a vertical wall down to sea level at the true edge of the map", () => {
    // A tile at the very corner of the map has no real neighbor on 2 of
    // its sides — those should still get a wall down to height 0, like
    // the edge of a diorama base, rather than nothing.
    const heightmap = flatHeightmap(2, 2, 8);
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    // Every one of the 4 tiles borders the map edge on at least 2 sides
    // and none of them differ from each other, so all their walls come
    // from those map-edge sides: 4 tile squares + edge walls.
    const fills = instructions.filter((i) => i.action === "fill");
    expect(fills.length).toBeGreaterThan(2 * 2);
  });
});

/**
 * The shading rules themselves, away from the renderer. A square has one
 * normal (see polygonNormal), so these are the questions its brightness can
 * actually answer — and the ones fillTerrainQuad's turf shade is picked by.
 */
describe("faceBrightnessOf", () => {
  const tile = (h00: number, h10: number, h11: number, h01: number): Vec3[] => [
    { x: 0, y: 0, z: h00 },
    { x: 1, y: 0, z: h10 },
    { x: 1, y: 1, z: h11 },
    { x: 0, y: 1, z: h01 },
  ];

  it("leaves level ground exactly unshaded", () => {
    expect(faceBrightnessOf(tile(5, 5, 5, 5))).toBeCloseTo(1);
  });

  it("shades further from flat the steeper the tile gets", () => {
    const gentle = Math.abs(1 - faceBrightnessOf(tile(5.5, 5, 5, 5)));
    const middling = Math.abs(1 - faceBrightnessOf(tile(7, 5, 5, 5)));
    const steep = Math.abs(1 - faceBrightnessOf(tile(9, 5, 5, 5)));

    expect(gentle).toBeGreaterThan(0);
    expect(middling).toBeGreaterThan(gentle);
    expect(steep).toBeGreaterThan(middling);
  });

  /**
   * No dead zone: a tilt far below one 8-bit colour step is still a tilt,
   * so the only threshold anywhere in this path is fillTerrainQuad's own
   * FLAT_EPSILON.
   */
  it("shades a hair past flat, however invisible that shade is", () => {
    expect(faceBrightnessOf(tile(5.03, 5, 5, 5))).not.toBe(1);
  });

  /**
   * LIGHT_DIRECTION comes from -y/+x, so dropping a tile's north edge turns
   * it toward the light and raising it turns it away. Half a unit each way:
   * the normal that catches the light most directly is only about 27° off
   * vertical, and tilting past that darkens again — Lambert's rule, not
   * something to test around.
   */
  it("lightens a face turned toward the light and darkens one turned away", () => {
    expect(faceBrightnessOf(tile(4.5, 4.5, 5, 5))).toBeGreaterThan(1);
    expect(faceBrightnessOf(tile(5.5, 5.5, 5, 5))).toBeLessThan(1);
  });
});

/**
 * The other half of a tile's shade — see HEIGHT_TINT_PER_STEP. These are
 * the rules a player has to be able to rely on to read a map: brighter is
 * always higher, one step is always a visible amount, and the extremes
 * never wash out.
 */
describe("heightTint", () => {
  it("leaves the midpoint elevation at the terrain's own colour", () => {
    expect(heightTint(3)).toBeCloseTo(1);
  });

  it("rises with elevation, so brighter always means higher", () => {
    for (let elevation = 0; elevation < 6; elevation++) {
      expect(heightTint(elevation + 1)).toBeGreaterThan(heightTint(elevation));
    }
  });

  /**
   * A step has to survive turfFillFor's quantization, or neighbouring
   * elevations collapse back into the same texture and the cue is gone
   * again for exactly the small differences it is there to show.
   */
  it("separates two adjacent elevations by more than one turf shade bucket", () => {
    expect(turfFillFor("grass", heightTint(4)).texture).not.toBe(turfFillFor("grass", heightTint(5)).texture);
  });

  /**
   * Clamped at the top, so a volcano's peak is still ground rather than a
   * white hole. The bottom of the generated range is left well inside the
   * clamp — see MAX_HEIGHT_TINT.
   */
  it("saturates above the generated range instead of blowing out to white", () => {
    expect(heightTint(20)).toBe(heightTint(7));
    expect(heightTint(20)).toBeLessThan(1.35);
    expect(heightTint(0)).toBeGreaterThan(0.7);
  });
});

describe("turfFillFor", () => {
  it("hands back the same texture for the same shade, so tiles batch instead of each building their own", () => {
    expect(turfFillFor("grass", 1).texture).toBe(turfFillFor("grass", 1).texture);
  });

  it("quantizes, so two shades closer than one step share a texture", () => {
    expect(turfFillFor("grass", 0.8).texture).toBe(turfFillFor("grass", 0.801).texture);
    expect(turfFillFor("grass", 0.8).texture).not.toBe(turfFillFor("grass", 0.9).texture);
  });

  it("gives each kind of ground its own weave", () => {
    const kinds = ["grass", "desert", "snow", "rock", "forest", "road", "fungus", "scorched"] as const;
    const textures = new Set(kinds.map((kind) => turfFillFor(kind, 1).texture));

    expect(textures.size).toBe(kinds.length);
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

  /**
   * A 岩礁 sets rockHardness exactly as a volcano flow does, so without a
   * floor it glowed like one — a player's own breakwater came out of the
   * sea looking like molten lava. The dark volcanic stone is right for a
   * reef (the original makes one by 「海底火山を噴火させ」); the fire is not.
   */
  it("does not glow at all at reef hardness — a breakwater is not lava", () => {
    for (let t = 0; t < 3; t += 0.3) {
      expect(volcanoGlowIntensity(REEF_HARDNESS, VOLCANO_ROCK_HARDNESS, t, 0.5)).toBe(0);
    }
  });

  /** The same statement read the other way: rock glows only while it is hotter than a reef. */
  it("stops glowing once a volcano has cooled to reef hardness", () => {
    expect(volcanoGlowIntensity(REEF_HARDNESS - 1, VOLCANO_ROCK_HARDNESS, 0.4, 0.2)).toBe(0);
    expect(volcanoGlowIntensity(REEF_HARDNESS + 1, VOLCANO_ROCK_HARDNESS, 0.4, 0.2)).toBeGreaterThan(0);
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

describe("waterFrameIndex", () => {
  it("cycles through more than one frame as time advances", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 3; t += 0.1) seen.add(waterFrameIndex(t));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("holds the same frame within one animation step, not every tick", () => {
    expect(waterFrameIndex(0)).toBe(waterFrameIndex(0.1));
  });

  it("gives the same elapsed time the same frame (deterministic)", () => {
    expect(waterFrameIndex(1.23)).toBe(waterFrameIndex(1.23));
  });
});

describe("terrain kinds that overlap", () => {
  /**
   * Woodland and a crevice can sit on the same vertex — an earthquake tears
   * straight through a forest — and the two want opposite fills: a canopy
   * texture, or the flat near-black of a hole. This is the precedence the
   * merge of those two features had to settle, so it is pinned here rather
   * than left to whichever ternary happened to come first.
   *
   * A crevice wins. It kills whoever walks in; trees over the top of it
   * would hide the one thing the player has to see.
   */
  it("draws a crevice as a hole even where a forest stood", () => {
    const wooded = flatHeightmap(3, 3, 5);
    for (const row of wooded.forest) row.fill(true);
    const woodedFills = drawInstructions(new IsoRenderer(wooded)).filter((i) => i.action === "fill");

    const torn = flatHeightmap(3, 3, 5);
    for (const row of torn.forest) row.fill(true);
    for (const row of torn.crevice) row.fill(true);
    const tornFills = drawInstructions(new IsoRenderer(torn)).filter((i) => i.action === "fill");

    // Counted rather than asserted over every fill: the map's own outer
    // edge is drawn as solid-colour walls (see drawEdgeWall), and on a 3x3
    // map every tile touches it.
    const textured = (fills: typeof woodedFills) => fills.filter((f) => f.data.style!.texture !== Texture.WHITE).length;

    expect(textured(woodedFills)).toBeGreaterThan(0);
    expect(textured(tornFills)).toBe(0);
  });
});

describe("road and fungus surfaces", () => {
  /**
   * Every ground surface is drawn with its own dither texture (see
   * SURFACE_FILL), so "does paving look different from grass?" is exactly
   * "did these two maps use different textures?". Compared as texture
   * identity rather than by sampling pixels: the textures are generated
   * once at module load, so identity is the whole distinction the renderer
   * itself makes.
   */
  const texturesUsed = (heightmap: Heightmap) =>
    new Set(
      drawInstructions(new IsoRenderer(heightmap))
        .filter((i) => i.action === "fill" && i.data.style!.texture !== Texture.WHITE)
        .map((i) => i.data.style!.texture),
    );

  const covered = (layer: "road" | "fungus" | "forest") => {
    const heightmap = flatHeightmap(3, 3, 5);
    for (const row of heightmap[layer]) row.fill(true);
    return heightmap;
  };

  it("draws paving, rot, canopy and bare ground as four different surfaces", () => {
    const surfaces = [texturesUsed(flatHeightmap(3, 3, 5)), texturesUsed(covered("road")), texturesUsed(covered("fungus")), texturesUsed(covered("forest"))];

    for (const surface of surfaces) expect(surface.size).toBe(1);
    expect(new Set(surfaces.map((surface) => [...surface][0])).size).toBe(4);
  });

  /**
   * A vertex is never both paved and rotten (applyRoad refuses fungus), but
   * a tile has four corners, so a tile on the boundary between a road and
   * the outbreak it is holding back touches one of each. The rot wins:
   * standing on it is fatal, and paving drawn over the top would hide the
   * one thing the player has to see.
   */
  it("draws rot rather than paving on the tile where the two meet", () => {
    const boundary = flatHeightmap(3, 3, 5);
    for (const row of boundary.road) row.fill(true);
    boundary.fungus[1][1] = true;

    expect(texturesUsed(boundary)).toEqual(new Set([...texturesUsed(covered("fungus")), ...texturesUsed(covered("road"))]));
    expect(texturesUsed(boundary).size).toBe(2);
  });

  it("draws a crevice as a hole even where a road ran", () => {
    const torn = covered("road");
    for (const row of torn.crevice) row.fill(true);

    expect(texturesUsed(torn).size).toBe(0);
  });
});
