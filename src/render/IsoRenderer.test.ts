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
  it("draws far fewer triangles when given a small, edge-free bounds than the whole map", () => {
    const heightmap = flatHeightmap(40, 40, 5);
    const renderer = new IsoRenderer(heightmap);
    const polySpy = vi.spyOn(Graphics.prototype, "poly");

    polySpy.mockClear();
    renderer.redraw(); // whole map: 40*40 tiles * 2 triangles each, plus a
    // perimeter of vertical walls along the map's own outer edge (see
    // drawEdgeWall) — an interior height difference never draws one.
    const fullMapCalls = polySpy.mock.calls.length;

    polySpy.mockClear();
    renderer.redraw({ minX: 10, maxX: 14, minY: 10, maxY: 14 }); // 5*5 interior tiles, no map edges crossed
    const boundedCalls = polySpy.mock.calls.length;

    expect(fullMapCalls).toBeGreaterThan(40 * 40 * 2);
    expect(boundedCalls).toBe(5 * 5 * 2);
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
  it("draws each tile as a single flat, unshaded quad + stroke when everything is at sea level", () => {
    // Elevation 0 matches flatHeightmap's own default waterLevel (0), so
    // every tile here is water — always a flat quad, never split into
    // sloped triangles (see redraw()'s isWater branch) — and no edge walls
    // either, since there's nothing above sea level to drop down from.
    const heightmap = flatHeightmap(4, 4, 0);
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    expect(instructions).toHaveLength(4 * 4 * 2);
    expect(instructions.filter((i) => i.action === "fill")).toHaveLength(4 * 4);
    expect(instructions.filter((i) => i.action === "stroke")).toHaveLength(4 * 4);
  });

  it("draws more fills once a raised patch turns neighboring underwater tiles into dry land", () => {
    const heightmap = flatHeightmap(5, 5, 0); // every tile starts as water (elevation 0 == waterLevel 0)
    const flatFillCount = drawInstructions(new IsoRenderer(heightmap)).filter((i) => i.action === "fill").length;

    // Raising every corner of the interior tile (2,2) also partially lifts
    // its neighbors' averaged heights (corners are shared), pushing some of
    // them from water (1 flat quad) into dry land (2 shaded triangles) —
    // with no vertical wall anywhere, since none of this touches the map's
    // own outer edge.
    heightmap.vertices[2][2] = 4;
    heightmap.vertices[2][3] = 4;
    heightmap.vertices[3][2] = 4;
    heightmap.vertices[3][3] = 4;
    const raisedFillCount = drawInstructions(new IsoRenderer(heightmap)).filter((i) => i.action === "fill").length;

    expect(raisedFillCount).toBeGreaterThan(flatFillCount);
  });

  it("shades a map-edge wall darker than the flat top it descends from, in one of two directional tones", () => {
    // Desert, not grass: grass tops are dithered (see GRASS_FILL) rather
    // than a plain color, which this test isn't about. A uniform flat map
    // relies purely on the map's own true outer edge for its walls — every
    // interior tile boundary here is perfectly flat and gets no wall at all.
    const heightmap = flatHeightmap(3, 3, 5);
    heightmap.terrain = "desert";
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    const colors = new Set(instructions.filter((i) => i.action === "fill").map((i) => i.data.style!.color));

    // Every tile here is flat plain desert (elevation is above waterLevel 0
    // and none of it is volcano rock), so every triangle fills unshaded
    // with TERRAIN_COLOR.desert. Only tile (1,1) has no map-edge wall; every
    // other tile borders the map's true edge on at least one side, shading
    // toward one of two tones depending on which way it faces (see
    // drawEdgeWall's fixed outward normal per direction) — exactly 3
    // distinct colors total: the flat top, plus a lit and a shadowed wall.
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
    expect(fills).toHaveLength(6); // 2 flat top triangles + 4 edge walls

    // redraw() fills a tile's own 2 triangles first, then always draws its
    // 4 edge walls in north/east/south/west order (see its own body) — a
    // stable enough contract for this single-tile scene to just read the
    // walls off by position instead of hunting for each one by its screen
    // geometry (a wall's own first point can coincide with another fill's,
    // since toScreen can map distinct (x, y, elevation) triples onto the
    // same screen point).
    const [topA, topB, north, east, south, west] = fills.map((f) => f.data.style!.color);

    expect(topA).toBe(topB); // flat, so both triangles are the same unshaded desert color
    expect(north).toBe(east);
    expect(south).toBe(west);
    expect(north).not.toBe(south);

    const [nr, ng, nb] = channels(north);
    const [sr, sg, sb] = channels(south);
    expect(nr).toBeGreaterThan(sr);
    expect(ng).toBeGreaterThan(sg);
    expect(nb).toBeGreaterThan(sb);
  });

  it("shades an interior slope more the steeper it is, with no minimum threshold and never a vertical wall", () => {
    const DESERT = 0xd6b25e; // TERRAIN_COLOR.desert
    const [dr, dg, db] = channels(DESERT);

    const maxShadeDistance = (cornerDelta: number): number => {
      const heightmap = flatHeightmap(6, 6, 5); // big enough that tile (2,2) sits nowhere near the map's own edge
      heightmap.terrain = "desert";
      heightmap.vertices[2][2] += cornerDelta; // tilts both triangles that share this one corner
      const renderer = new IsoRenderer(heightmap);
      renderer.redraw({ minX: 2, maxX: 2, minY: 2, maxY: 2 }); // isolates tile (2,2)'s own draws
      const fills = drawInstructions(renderer).filter((i) => i.action === "fill");
      expect(fills).toHaveLength(2); // exactly its own 2 triangles — an interior height difference never draws a wall

      return Math.max(
        ...fills.map((f) => {
          const [r, g, b] = channels(f.data.style!.color);
          return Math.abs(dr - r) + Math.abs(dg - g) + Math.abs(db - b);
        }),
      );
    };

    expect(maxShadeDistance(0.01)).toBe(0); // within FLAT_EPSILON: still reads as perfectly flat
    const gentle = maxShadeDistance(0.5);
    const steep = maxShadeDistance(4);
    expect(gentle).toBeGreaterThan(0);
    expect(steep).toBeGreaterThan(gentle);
  });

  it("shades an interior slope differently depending on which way it faces, not just how steep it is", () => {
    const shadeFor = (cornerDelta: number): number => {
      const heightmap = flatHeightmap(6, 6, 5);
      heightmap.terrain = "desert";
      heightmap.vertices[2][2] += cornerDelta;
      const renderer = new IsoRenderer(heightmap);
      renderer.redraw({ minX: 2, maxX: 2, minY: 2, maxY: 2 });
      const [fill] = drawInstructions(renderer).filter((i) => i.action === "fill");
      return fill.data.style!.color;
    };

    // Tilting the same corner up vs. down changes which way the triangle's
    // face points, not just how far it points away from flat — these
    // should not land on the same shade.
    expect(shadeFor(3)).not.toBe(shadeFor(-3));
  });

  it("dithers a flat grass triangle with the speckled texture instead of a flat color", () => {
    const heightmap = flatHeightmap(3, 3, 0); // flatHeightmap defaults to grass terrain
    heightmap.waterLevel = -1; // land despite elevation 0 — see isBuildable's own use of waterLevel
    const renderer = new IsoRenderer(heightmap);
    const instructions = drawInstructions(renderer);
    const tops = instructions.filter((i) => i.action === "fill");

    expect(tops).toHaveLength(3 * 3 * 2); // every land tile is 2 flat, dithered triangles, not 1 quad
    for (const top of tops) {
      // A plain color fill (a map-edge wall, or a sloped/non-grass
      // triangle) still carries Pixi's own default 1x1 white texture — a
      // real texture fill (GRASS_FILL) is the only kind that replaces it.
      expect(top.data.style!.texture).not.toBe(Texture.WHITE);
    }
  });

  it("shades a sloped grass triangle as a plain tinted color instead of dithering it", () => {
    const heightmap = flatHeightmap(6, 6, 5); // grass by default; big enough for an edge-free interior tile
    heightmap.vertices[2][2] += 3; // tilts tile (2,2)'s corner
    const renderer = new IsoRenderer(heightmap);
    renderer.redraw({ minX: 2, maxX: 2, minY: 2, maxY: 2 });
    const fills = drawInstructions(renderer).filter((i) => i.action === "fill");
    expect(fills).toHaveLength(2);
    for (const fill of fills) {
      expect(fill.data.style!.texture).toBe(Texture.WHITE);
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
    // from those map-edge sides: 4 tiles * 2 triangles + edge walls.
    const fills = instructions.filter((i) => i.action === "fill");
    expect(fills.length).toBeGreaterThan(2 * 2 * 2);
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
