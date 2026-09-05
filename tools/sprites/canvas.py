"""A tiny pixel canvas with the isometric primitives the sprites need.

Pixel art at this size is mostly about deciding, per pixel, which of a few
palette tones it gets — so the drawing surface is a plain RGBA grid with
integer coordinates and no anti-aliasing anywhere. Everything here fills
whole pixels or does nothing.

The isometric helpers match IsoRenderer's own 2:1 projection (TILE_WIDTH
64 : TILE_HEIGHT 32), so a building drawn with iso_prism sits at the same
angle as the ground under it.

Lighting follows the terrain's own fixed sun. IsoRenderer's LIGHT_DIRECTION
is (+x, -y) in tile space; both of those project to screen-*right*
((+32,+16) and (+32,-16) respectively), so a face pointing screen-right is
the lit one and screen-left is the shadowed one. The old procedural house
code had this backwards — it lit the left face — which meant buildings and
terrain disagreed about where the sun was.
"""

from __future__ import annotations

from PIL import Image

RGB = tuple[int, int, int]
TRANSPARENT = (0, 0, 0, 0)


def shade(color: RGB, amount: float) -> RGB:
    """Lightens (amount > 0) or darkens (amount < 0) toward white/black.
    Used sparingly — most tones come from the palette so that sprites and
    UI stay in the same small set of colors."""
    if amount >= 0:
        return tuple(round(c + (255 - c) * amount) for c in color)  # type: ignore[return-value]
    return tuple(round(c * (1 + amount)) for c in color)  # type: ignore[return-value]


class Canvas:
    """An RGBA pixel grid. (0, 0) is top-left; all writes are clipped."""

    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self._pixels: list[list[tuple[int, int, int, int]]] = [
            [TRANSPARENT for _ in range(width)] for _ in range(height)
        ]

    def px(self, x: int, y: int, color: RGB | None) -> None:
        if color is None or not (0 <= x < self.width and 0 <= y < self.height):
            return
        self._pixels[y][x] = (*color, 255)

    def get(self, x: int, y: int) -> tuple[int, int, int, int]:
        if not (0 <= x < self.width and 0 <= y < self.height):
            return TRANSPARENT
        return self._pixels[y][x]

    def opaque(self, x: int, y: int) -> bool:
        return self.get(x, y)[3] != 0

    def hline(self, x0: int, x1: int, y: int, color: RGB) -> None:
        for x in range(min(x0, x1), max(x0, x1) + 1):
            self.px(x, y, color)

    def vline(self, x: int, y0: int, y1: int, color: RGB) -> None:
        for y in range(min(y0, y1), max(y0, y1) + 1):
            self.px(x, y, color)

    def rect(self, x0: int, y0: int, x1: int, y1: int, color: RGB) -> None:
        for y in range(min(y0, y1), max(y0, y1) + 1):
            self.hline(x0, x1, y, color)

    def polygon(self, points: list[tuple[float, float]], color: RGB) -> None:
        """Scanline-fills a polygon. Samples at each row's center so that a
        2:1 isometric edge comes out as the clean 2-pixel staircase the
        style wants, rather than a ragged one."""
        if len(points) < 3:
            return
        top = max(0, int(min(y for _, y in points)))
        bottom = min(self.height - 1, int(max(y for _, y in points)) + 1)

        for y in range(top, bottom + 1):
            sample = y + 0.5
            crossings: list[float] = []
            for i in range(len(points)):
                (x0, y0), (x1, y1) = points[i], points[(i + 1) % len(points)]
                if (y0 <= sample) != (y1 <= sample):
                    crossings.append(x0 + (sample - y0) / (y1 - y0) * (x1 - x0))
            crossings.sort()
            for i in range(0, len(crossings) - 1, 2):
                for x in range(int(round(crossings[i])), int(round(crossings[i + 1]))):
                    self.px(x, y, color)

    def outline(self, color: RGB) -> None:
        """Darkens the sprite's own silhouette edge by one pixel, so a
        walker or building stays readable against terrain of any brightness
        — the whole map is mid-tone green, and an unoutlined 11px figure
        disappears into it."""
        edges = [
            (x, y)
            for y in range(self.height)
            for x in range(self.width)
            if not self.opaque(x, y)
            and any(self.opaque(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        ]
        for x, y in edges:
            self.px(x, y, color)

    def to_image(self) -> Image.Image:
        image = Image.new("RGBA", (self.width, self.height), TRANSPARENT)
        image.putdata([px for row in self._pixels for px in row])
        return image


def iso_diamond(cx: float, cy: float, half_width: float) -> list[tuple[float, float]]:
    """The 4 corners of a 2:1 isometric diamond centered on (cx, cy) —
    a building's footprint, a roof's top face, a tower's cap."""
    half_depth = half_width / 2
    return [(cx, cy - half_depth), (cx + half_width, cy), (cx, cy + half_depth), (cx - half_width, cy)]


def iso_prism(
    canvas: Canvas,
    cx: float,
    base_y: float,
    half_width: float,
    height: float,
    left: RGB,
    right: RGB,
    top: RGB | None = None,
) -> None:
    """An isometric box standing on the diamond centered at (cx, base_y).

    `left`/`right` are the two visible vertical faces; per this module's
    lighting note, `right` should be the lit tone and `left` the shadowed
    one. `top` fills the cap, for a box with no roof of its own."""
    half_depth = half_width / 2
    front = (cx, base_y + half_depth)
    left_corner = (cx - half_width, base_y)
    right_corner = (cx + half_width, base_y)

    def up(point: tuple[float, float]) -> tuple[float, float]:
        return (point[0], point[1] - height)

    canvas.polygon([left_corner, front, up(front), up(left_corner)], left)
    canvas.polygon([front, right_corner, up(right_corner), up(front)], right)
    if top is not None:
        canvas.polygon(iso_diamond(cx, base_y - height, half_width), top)
