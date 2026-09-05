"""Draws the walker sprite frames.

This is the authoring source for what used to be immediate-mode `Graphics`
calls in src/render/pixelArt.ts's drawWalkerSprite. The move is per the
agreed tooling direction (plan/0089): PixiJS already has everything needed
to *display* pixel art, what the project lacked was a decent way to
*author* it. A pattern here can be edited a pixel at a time; a chain of
`g.rect(...).fill(...)` calls could not.

The frame matrix is small enough to enumerate exhaustively — 2 factions x
6 poses x 4 facings x 2 walk-cycle frames = 96 frames of 7x9 pixels — so
there is no need for runtime tinting or layer compositing on the TS side.
Every frame is a finished picture.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from palette import Palette  # noqa: E402

# Every frame shares one canvas size with the walker's ground point at the
# bottom-center, so the TS side can anchor every sprite identically instead
# of carrying a per-frame offset. The cost is a few transparent pixels on
# the poses that don't need the full box.
FRAME_WIDTH = 5
FRAME_HEIGHT = 9

BODY_LEFT = 0
"""The body pattern is itself 5 wide, so it fills the canvas horizontally."""
BODY_TOP = 2
"""Row the 7-row body pattern starts at, leaving rows 0-1 for a leader's plume."""

TRANSPARENT = (0, 0, 0, 0)

# Front (toward camera) has a small dark eye-pixel; back doesn't. Only the
# stepping frame's arm is asymmetric (poking out to one side), so a mirrored
# "*W" step reads as a genuinely different pose from its "*E" counterpart,
# not just a recolor — the arm is what actually sells the walking direction;
# a standing person can look symmetric either way.
#
#   H skin   E eye   C clothing   A clothing (swinging arm)   T boot
BODY_PATTERNS: dict[tuple[bool, bool], list[str]] = {
    # (toward_camera, stepping)
    (True, False): [".HHH.", ".HEH.", ".CCC.", ".CCC.", ".CCC.", ".T.T.", ".T.T."],
    (True, True): [".HHH.", ".HEH.", "ACCC.", ".CCC.", ".CCC.", "T...T", ".T.T."],
    (False, False): [".HHH.", ".HHH.", ".CCC.", ".CCC.", ".CCC.", ".T.T.", ".T.T."],
    (False, True): [".HHH.", ".HHH.", "ACCC.", ".CCC.", ".CCC.", "T...T", ".T.T."],
}

# Marks drawn in the column outside the body, as (column, rows, palette key).
# Unlike the old Graphics version — which placed these at fractional offsets
# like `centerX + scale * 1.8` and so never landed on a pixel boundary —
# these are whole pixels by construction. That is the point of authoring the
# art on a grid rather than as draw calls.
# Column 2 is the canvas centerline, so the plume is mirror-invariant and
# stays over the head on all four facings.
LEADER_PLUME = {"rows": (0, 1), "column": 2, "key": "clothing"}
# Column 4 is the body's own outer edge, so a mark there is held against the
# walker rather than floating beside it. It only ever shares that column
# with the stepping frame's trailing boot, which is two rows lower.
KNIGHT_BLADE = {"rows": (3, 4, 5, 6), "column": 4, "key": "stoneLight"}
GUARDIAN_SHIELD = {"rows": (4, 5, 6), "column": 4, "key": "bronzeMid"}

FACINGS = ("NE", "NW", "SE", "SW")
"""The 4 isometric movement directions — see Facing in src/render/pixelArt.ts.
"S*" faces toward the camera, "*W" is the horizontal mirror of "*E"."""

SKIN = (0xE0, 0xB8, 0x8A)
"""The walker's own skin tone. Not in the shared palette: it is specific to
this one sprite and would only be noise in a palette the UI also reads."""


@dataclass(frozen=True)
class Pose:
    """One combination of the flags EntityLayer already tracks per walker."""

    name: str
    leader: bool
    hero: str | None


POSES = [
    Pose("plain", leader=False, hero=None),
    Pose("leader", leader=True, hero=None),
    Pose("knight", leader=False, hero="knight"),
    Pose("guardian", leader=False, hero="guardian"),
    Pose("leaderKnight", leader=True, hero="knight"),
    Pose("leaderGuardian", leader=True, hero="guardian"),
]
"""A leader can also be promoted to a hero, and the old Graphics version drew
both marks in that case, so the pair is enumerated rather than treated as
mutually exclusive."""

FACTIONS = {"player": "playerAccent", "enemy": "enemyAccent"}
"""Walker clothing takes the calibrated faction accents straight from the
palette. EntityLayer used to keep its own brighter pair of literals, which
is exactly the drift plan/0089 set out to remove — and the palette's blue is
the original's own walker blue, so this is also the more faithful color."""


def frame_key(faction: str, pose: str, facing: str, stepping: bool) -> str:
    """The atlas key. Mirrored by walkerFrameKey() in src/render/walkerSprites.ts —
    the two must agree exactly, which the round-trip test there checks."""
    return f"walker_{faction}_{pose}_{facing}_{'step' if stepping else 'stand'}"


def _put(image: Image.Image, x: int, y: int, rgb: tuple[int, int, int], mirror: bool) -> None:
    column = FRAME_WIDTH - 1 - x if mirror else x
    image.putpixel((column, y), (*rgb, 255))


def render_frame(palette: Palette, faction: str, pose: Pose, facing: str, stepping: bool) -> Image.Image:
    toward_camera = facing[0] == "S"
    mirror = facing[1] == "W"
    clothing = palette.rgb(FACTIONS[faction])
    colors = {
        "H": SKIN,
        "E": palette.rgb("ink"),
        "C": clothing,
        "A": clothing,
        "T": palette.rgb("ink"),
        "clothing": clothing,
        "stoneLight": palette.rgb("stoneLight"),
        "bronzeMid": palette.rgb("bronzeMid"),
    }

    image = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT), TRANSPARENT)

    for row_index, row in enumerate(BODY_PATTERNS[(toward_camera, stepping)]):
        for column_index, key in enumerate(row):
            if key == ".":
                continue
            _put(image, BODY_LEFT + column_index, BODY_TOP + row_index, colors[key], mirror)

    marks = []
    if pose.leader:
        marks.append(LEADER_PLUME)
    if pose.hero == "knight":
        marks.append(KNIGHT_BLADE)
    elif pose.hero == "guardian":
        marks.append(GUARDIAN_SHIELD)

    for mark in marks:
        for row in mark["rows"]:
            _put(image, mark["column"], row, colors[mark["key"]], mirror)

    return image


def render_all(palette: Palette) -> dict[str, Image.Image]:
    frames: dict[str, Image.Image] = {}
    for faction in FACTIONS:
        for pose in POSES:
            for facing in FACINGS:
                for stepping in (False, True):
                    key = frame_key(faction, pose.name, facing, stepping)
                    frames[key] = render_frame(palette, faction, pose, facing, stepping)
    return frames
