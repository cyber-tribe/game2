"""Draws the building sprite frames.

Replaces the procedural isometric geometry that used to live in
src/render/pixelArt.ts (drawWalls / drawHipRoof / drawCastle). That code
could only emit flat-shaded polygons — it had no way to put a thatch
streak, a stone course, a lit window or a silhouette outline on a wall,
because every one of those is a per-pixel decision and it was working in
floating-point polygon space.

Sizes here are roughly double the old ones. On a 64px tile a hut used to be
12px wide, which left no room for any of the above; at 26px the same hut
can carry a door, a textured roof and a readable outline, and it reads as a
building on the ground rather than a marker floating over it.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from palette import Palette  # noqa: E402

from .canvas import RGB, Canvas, iso_diamond, iso_prism, shade  # noqa: E402

FACTIONS = {"player": "playerAccent", "enemy": "enemyAccent"}
"""Only the flag takes a faction color. Per plan/archived/0085, ownership
reads from the banner rather than from tinting the whole structure — the
original never painted its buildings a team color."""

LEVELS = ("hut", "lodge", "manor", "castle")

DRAW_SIZE: dict[str, tuple[int, int]] = {
    "hut": (26, 28),
    "lodge": (32, 34),
    "manor": (40, 44),
    "castle": (56, 56),
}
"""How much room each level's drawing actually needs."""

FRAME_WIDTH = max(w for w, _ in DRAW_SIZE.values())
FRAME_HEIGHT = max(h for _, h in DRAW_SIZE.values())
"""Every frame is emitted at one size, with the building's ground point at
bottom center. Uniform frames let the atlas pack as a plain grid and let the
TS side anchor every building identically (0.5, 1); the transparent margin
around a hut costs nothing, since a mostly-empty PNG compresses to almost
nothing anyway."""


def _tones(palette: Palette) -> dict[str, RGB]:
    """Three clear value steps, not a dozen similar browns.

    The first cut of these sprites used near-identical tones for roof and
    wall and the whole building read as one brown blob at actual size. What
    makes a 26px building legible is *value* separation: a light roof over
    dark walls, with texture only ever a one-step nudge inside a face —
    never enough to compete with the roof/wall boundary itself."""
    return {
        # Thatch: the lightest thing on the building.
        "thatchLit": palette.rgb("stoneHighlight"),
        "thatchMid": palette.rgb("stoneLight"),
        "thatchDark": palette.rgb("stoneMid"),
        # Daub/timber walls: two steps down the same ramp. Darker than this
        # and the door and timber posts have nowhere left to go.
        "wallLit": palette.rgb("stoneMid"),
        "wallDark": palette.rgb("stoneDark"),
        "wallSeam": palette.rgb("stoneShadow"),
        # Dressed stone, for the manor and castle.
        "stoneLit": palette.rgb("stoneLight"),
        "stoneDark": palette.rgb("stoneMid"),
        # Upward-facing surfaces (roof decks, merlon caps) catch the most
        # light of anything on a building — without this they came out the
        # same value as the walls and the castle read as a flat cutout.
        "stoneDeck": palette.rgb("stoneHighlight"),
        "stoneSeam": shade(palette.rgb("stoneMid"), -0.12),
        # Fired roof tiles, for the manor.
        "tileLit": palette.rgb("bronzeMid"),
        "tileDark": shade(palette.rgb("bronzeMid"), -0.26),
        "timber": palette.rgb("bronzeDark"),
        "outline": palette.rgb("ink"),
        "door": palette.rgb("ink"),
        "window": palette.rgb("bronzeLight"),
        "pole": palette.rgb("bronzeDark"),
    }


def _ground(height: int, half_depth: float) -> float:
    """Y of the footprint diamond's center, placed so the diamond's front
    corner lands on the frame's bottom row — the sprite is anchored
    bottom-center on the walker's/house's own ground point."""
    return height - 1 - half_depth


def _restripe(canvas: Canvas, top: int, bottom: int, step: int, only: set[RGB], color: RGB) -> None:
    """Recolors every `step`-th row of the pixels already matching `only`.

    Restricting to specific source tones is what keeps a texture inside one
    face: a thatch course must not run across the wall below it, and the
    face colors are the only thing that says where that boundary is. Solid
    rows, not a checkerboard — the first cut scattered single pixels and
    read as dirt rather than as courses."""
    for y in range(top, bottom + 1):
        if (y - top) % step:
            continue
        course = (y - top) // step
        for x in range(canvas.width):
            # Broken, staggered joints. A continuous line across the whole
            # sprite reads as clapboard siding; blocks of 3 with a gap and a
            # per-course offset read as coursed stone.
            if (x + course * 2) % 5 == 4:
                continue
            pixel = canvas.get(x, y)
            if pixel[3] and pixel[:3] in only:
                canvas.px(x, y, color)


POLE_HEIGHT = 8


def _flag(canvas: Canvas, tones: dict[str, RGB], x: int, pole_bottom: int, color: RGB) -> None:
    """A pennant on a short pole planted at the roof — the only
    faction-colored part of a building (plan/archived/0085: ownership reads
    from the banner, never from tinting the structure).

    The pole is a fixed length above where it is planted. An earlier version
    ran it from the frame's top edge down to the roof, which made a tall
    building's flag sit on a stub and a short one's on a mast."""
    top = max(0, pole_bottom - POLE_HEIGHT)
    canvas.vline(x, top, pole_bottom, tones["pole"])
    for row in range(4):
        canvas.hline(x + 1, x + 5 - row, top + row, color)


def _hip_line(canvas: Canvas, start: tuple[float, float], end: tuple[float, float], color: RGB) -> None:
    """A 1px line along a roof hip, in whole pixels (Bresenham)."""
    x0, y0, x1, y1 = int(round(start[0])), int(round(start[1])), int(round(end[0])), int(round(end[1]))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    error = dx + dy
    while True:
        if canvas.opaque(x0, y0):
            canvas.px(x0, y0, color)
        if x0 == x1 and y0 == y1:
            return
        doubled = 2 * error
        if doubled >= dy:
            error += dy
            x0 += sx
        if doubled <= dx:
            error += dx
            y0 += sy


def _pyramid_roof(
    canvas: Canvas,
    cx: float,
    eaves_y: float,
    half_width: float,
    height: float,
    lit: RGB,
    dark: RGB,
) -> None:
    """A 4-sided roof converging on a single apex over the footprint center.

    An earlier attempt ran a ridge along the screen-vertical axis. That axis
    is the footprint diamond's *diagonal*, not one of the two tile axes the
    building actually sits on, so the roof's upper half collapsed to a
    1px-wide spike and the whole thing read as a flat disc. A pyramid has no
    such ambiguity — every one of its four faces is a triangle on a real
    tile axis — and at this size it is also just what a thatched hut looks
    like.

    The two hidden back faces need not be drawn: the two visible triangles
    exactly tile the silhouette L-F-R-apex."""
    half_depth = half_width / 2
    left = (cx - half_width, eaves_y)
    right = (cx + half_width, eaves_y)
    front = (cx, eaves_y + half_depth)
    apex = (cx, eaves_y - height)

    canvas.polygon([left, front, apex], dark)
    canvas.polygon([front, right, apex], lit)
    # The near hip — the fold between the two faces. Both slopes meet along
    # it, and without it the colour change alone reads as a smudge.
    _hip_line(canvas, front, apex, shade(dark, -0.12))


def draw_hut(canvas: Canvas, tones: dict[str, RGB], flag: RGB) -> None:
    cx = canvas.width / 2
    half_width = 8.0
    ground = _ground(canvas.height, half_width / 2)
    wall_height = 8.0
    eaves = ground - wall_height
    roof_height = 11.0

    iso_prism(canvas, cx, ground, half_width, wall_height, tones["wallDark"], tones["wallLit"])
    # One corner post per visible face rather than a row of them: at this
    # size more than that stops reading as timber framing and just makes the
    # wall look striped.
    canvas.vline(int(cx), int(eaves) + 4, int(ground) + 4, tones["wallSeam"])

    _door(canvas, tones, cx, ground, width=3, height=6)
    _pyramid_roof(canvas, cx, eaves, half_width + 2, roof_height, tones["thatchLit"], tones["thatchMid"])
    _restripe(canvas, int(eaves - roof_height), int(eaves) + 5, 3, {tones["thatchLit"], tones["thatchMid"]}, tones["thatchDark"])
    _flag(canvas, tones, int(cx) + 3, int(eaves - roof_height) + 3, flag)


def _door(canvas: Canvas, tones: dict[str, RGB], cx: float, ground: float, width: int, height: int) -> None:
    """A doorway on the lit (screen-right) face.

    On the shadowed face it would be a dark rectangle inside an already
    dark wall and simply vanish. The rows step down one per two columns so
    the opening follows the isometric face it sits on instead of floating
    as a screen-aligned box."""
    for i in range(width):
        x = int(cx) + 2 + i
        top = int(ground) - height + (i + 1) // 2
        canvas.vline(x, top, int(ground) + (i + 1) // 2, tones["door"])

def _gable_roof(
    canvas: Canvas,
    cx: float,
    eaves_y: float,
    half_width: float,
    height: float,
    lit: RGB,
    dark: RGB,
) -> None:
    """A two-slope roof with its ridge along a real tile axis.

    The ridge runs above the midpoints of two opposite footprint edges, so
    on screen it is a 2:1 diagonal rather than an axis-aligned line — which
    is exactly what makes it read as sitting on the isometric ground. The
    far slope is painted first and then covered; only the parts of it beyond
    the near slope's silhouette survive, which is what the eye expects to
    see past the ridge."""
    half_depth = half_width / 2
    left = (cx - half_width, eaves_y)
    right = (cx + half_width, eaves_y)
    front = (cx, eaves_y + half_depth)
    back = (cx, eaves_y - half_depth)
    ridge_back = (cx - half_width / 2, eaves_y - half_depth / 2 - height)
    ridge_front = (cx + half_width / 2, eaves_y + half_depth / 2 - height)

    canvas.polygon([back, right, ridge_front, ridge_back], shade(dark, -0.12))
    canvas.polygon([left, front, ridge_front, ridge_back], dark)
    canvas.polygon([front, right, ridge_front], lit)
    _hip_line(canvas, ridge_back, ridge_front, shade(lit, 0.25))
    _hip_line(canvas, front, ridge_front, shade(dark, -0.12))


def _window(canvas: Canvas, tones: dict[str, RGB], x: int, y: int, height: int = 3) -> None:
    """A small lit opening on the screen-right face, stepped down the
    isometric slope the same way _door is."""
    canvas.vline(x, y, y + height - 1, tones["window"])
    canvas.vline(x + 1, y + 1, y + height, tones["window"])


def _chimney(canvas: Canvas, tones: dict[str, RGB], x: int, top: int, bottom: int) -> None:
    """A stack standing clear of the ridge, with its lit face on the right
    like every other vertical surface and a dark mouth on top. Sunk into the
    slope with a flat light-grey cap, it read as a patch of missing roof."""
    canvas.rect(x, top + 1, x + 1, bottom, tones["stoneDark"])
    canvas.vline(x + 2, top + 1, bottom, tones["stoneLit"])
    canvas.hline(x, x + 2, top, tones["stoneSeam"])
    canvas.px(x + 1, top, tones["door"])


def draw_lodge(canvas: Canvas, tones: dict[str, RGB], flag: RGB) -> None:
    cx = canvas.width / 2
    half_width = 10.0
    ground = _ground(canvas.height, half_width / 2)
    wall_height = 10.0
    eaves = ground - wall_height
    roof_height = 12.0

    iso_prism(canvas, cx, ground, half_width, wall_height, tones["wallDark"], tones["wallLit"])
    canvas.vline(int(cx), int(eaves) + 5, int(ground) + 5, tones["wallSeam"])
    _door(canvas, tones, cx, ground, width=3, height=7)
    _window(canvas, tones, int(cx) + 6, int(ground) - 8)

    _pyramid_roof(canvas, cx, eaves, half_width + 2, roof_height, tones["thatchLit"], tones["thatchMid"])
    _restripe(canvas, int(eaves - roof_height), int(eaves) + 6, 3, {tones["thatchLit"], tones["thatchMid"]}, tones["thatchDark"])
    _flag(canvas, tones, int(cx) + 4, int(eaves - roof_height) + 4, flag)


def draw_manor(canvas: Canvas, tones: dict[str, RGB], flag: RGB) -> None:
    cx = canvas.width / 2
    half_width = 13.0
    ground = _ground(canvas.height, half_width / 2)
    wall_height = 14.0
    eaves = ground - wall_height
    roof_height = 9.0

    # Dressed stone rather than daub — the manor is the first level that
    # reads as built rather than thrown together.
    iso_prism(canvas, cx, ground, half_width, wall_height, tones["stoneDark"], tones["stoneLit"])
    _restripe(canvas, int(eaves) + 2, int(ground) + 7, 5, {tones["stoneDark"], tones["stoneLit"]}, tones["stoneSeam"])
    canvas.vline(int(cx), int(eaves) + 6, int(ground) + 6, tones["stoneSeam"])

    _door(canvas, tones, cx, ground, width=4, height=9)
    _window(canvas, tones, int(cx) + 7, int(ground) - 11)
    _window(canvas, tones, int(cx) - 7, int(ground) - 8)

    _gable_roof(canvas, cx, eaves, half_width + 1, roof_height, tones["tileLit"], tones["tileDark"])
    _chimney(canvas, tones, int(cx) - 7, int(eaves - roof_height) - 3, int(eaves) - 7)
    _flag(canvas, tones, int(cx) + 5, int(eaves - roof_height) + 2, flag)


def draw_castle(canvas: Canvas, tones: dict[str, RGB], flag: RGB) -> None:
    """A crenellated keep flanked by two taller towers.

    Drawn back-to-front: keep first, then the towers standing at the
    footprint's left and right corners, so they overlap the keep's near
    edges and the three volumes read as one castle instead of three boxes
    sitting side by side."""
    cx = canvas.width / 2
    half_width = 10.5
    ground = _ground(canvas.height, half_width / 2) - 3
    keep_height = 20.0
    keep_top = ground - keep_height

    iso_prism(canvas, cx, ground, half_width, keep_height, tones["stoneDark"], tones["stoneLit"])
    _restripe(canvas, int(keep_top) + 3, int(ground) + 6, 5, {tones["stoneDark"], tones["stoneLit"]}, tones["stoneSeam"])
    _battlements(canvas, tones, cx, keep_top, half_width)
    _gate(canvas, tones, cx, ground)

    tower_height = keep_height + 7
    for side in (-1, 1):
        tower_cx = cx + side * (half_width - 1)
        tower_ground = ground + 3
        tower_top = tower_ground - tower_height
        iso_prism(canvas, tower_cx, tower_ground, 5.0, tower_height, tones["stoneDark"], tones["stoneLit"])
        _restripe(canvas, int(tower_top) + 3, int(tower_ground) + 3, 5, {tones["stoneDark"], tones["stoneLit"]}, tones["stoneSeam"])
        _battlements(canvas, tones, tower_cx, tower_top, 5.0)
        _window(canvas, tones, int(tower_cx) + 1, int(tower_top) + 8, height=2)

    _flag(canvas, tones, int(cx), int(keep_top) - 2, flag)


def _battlements(canvas: Canvas, tones: dict[str, RGB], cx: float, top_y: float, half_width: float) -> None:
    """A merloned parapet: the roof deck, then real merlons standing on its
    two near edges.

    The merlons are small isometric prisms placed along the edge rather than
    screen-aligned rectangles stuck on the outline — an earlier version did
    the latter and they read as lumps growing out of the silhouette. This is
    the one feature that says "castle" at a glance, so it is worth the
    handful of extra prisms."""
    canvas.polygon(iso_diamond(cx, top_y, half_width), tones["stoneDeck"])
    left = (cx - half_width, top_y)
    right = (cx + half_width, top_y)
    front = (cx, top_y + half_width / 2)

    steps = max(2, round(half_width / 2.6))
    for start_corner in (left, right):
        for i in range(steps + 1):
            if i % 2:
                continue
            t = i / steps
            x = start_corner[0] + (front[0] - start_corner[0]) * t
            y = start_corner[1] + (front[1] - start_corner[1]) * t
            iso_prism(canvas, x, y, 1.8, 3.5, tones["stoneDark"], tones["stoneLit"], tones["stoneDeck"])


def _gate(canvas: Canvas, tones: dict[str, RGB], cx: float, ground: float) -> None:
    """An arched gate on the lit face, wider and taller than a house door."""
    x0 = int(cx) + 2
    for i in range(5):
        x = x0 + i
        top = int(ground) - 9 + (i + 1) // 2 + (1 if i in (0, 4) else 0)
        canvas.vline(x, top, int(ground) + (i + 1) // 2, tones["door"])


def frame_key(level: str, faction: str) -> str:
    """The atlas key. Mirrored by houseFrameKey() in
    src/render/houseSprites.ts; the round-trip test there checks the two
    agree."""
    return f"house_{faction}_{level}"


def render(palette: Palette, level: str, faction: str) -> Image.Image:
    tones = _tones(palette)
    width, height = DRAW_SIZE[level]
    canvas = Canvas(width, height)
    flag = palette.rgb(FACTIONS[faction])

    {"hut": draw_hut, "lodge": draw_lodge, "manor": draw_manor, "castle": draw_castle}[level](canvas, tones, flag)
    canvas.outline(tones["outline"])

    frame = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT), (0, 0, 0, 0))
    frame.paste(canvas.to_image(), ((FRAME_WIDTH - width) // 2, FRAME_HEIGHT - height))
    return frame


def render_all(palette: Palette) -> dict[str, Image.Image]:
    return {
        frame_key(level, faction): render(palette, level, faction)
        for faction in FACTIONS
        for level in LEVELS
    }
