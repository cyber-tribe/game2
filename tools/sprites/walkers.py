"""Draws the walker sprite frames.

The authoring source for what used to be immediate-mode `Graphics` calls in
src/render/pixelArt.ts. A pattern here can be edited a pixel at a time; a
chain of `g.rect(...).fill(...)` could not.

At the first pass these figures were 5x9 pixels — barely enough for a head,
a block of body and two boot pixels. They are now 11x18, which buys a face
with eyes, arms that swing independently of the body, legs that stride, and
room for a leader's plume and a hero's weapon to be actual shapes rather
than a rectangle stuck to one side.

The walk cycle is 4 frames (contact / passing / contact / passing) instead
of the old 2. Two frames at this size read as a twitch; four read as
walking, because the passing pose can lift the whole figure a pixel while
the contact poses plant it.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from palette import Palette  # noqa: E402

from .canvas import RGB, Canvas, shade  # noqa: E402

FRAME_WIDTH = 11
FRAME_HEIGHT = 18
"""Every frame shares one canvas with the walker's ground point at bottom
center, so the TS side anchors every sprite identically (0.5, 1) instead of
carrying a per-frame offset."""

BODY_TOP = 4
"""Rows 0-3 are left clear for a leader's plume. The body below it is laid
out head 5 / torso 4 / legs 5, which lands the boots exactly on row 17 —
the frame's bottom row, and so the walker's ground point."""

WALK_FRAMES = 4
"""contact / passing / contact / passing — see the module docstring."""

# One character per pixel. '.' is transparent; every other character is a
# key into the tone table built in _tones().
#
#   h hair   S skin   e eye   C tunic   c tunic shadow
#   A sleeve  s hand   L leg   B boot
#
# The head, torso and arms are shared; only the legs and the swinging arm
# change per walk frame, so those are overlaid separately below.
# One row of hair rather than two: the first pass gave the head a full cap
# of dark hair plus dark sides, and at 5x5 that left almost no face — the
# figure read as wearing a helmet.
HEAD_FRONT = [
    "....hhh....",
    "...hSSSh...",
    "...SeSeS...",
    "...SSSSS...",
    "....SSS....",
]
HEAD_BACK = [
    "....hhh....",
    "...hhhhh...",
    "...hhhhh...",
    "...hhhhh...",
    "....hSh....",
]
TORSO = [
    "...CCCCC...",
    "...CCCCC...",
    "...CCCCC...",
    "...ccccc...",
]

# Legs, indexed by walk frame. The contact poses plant the feet apart; the
# passing poses bring them together under the body.
LEGS_CONTACT = [
    "...LL.LL...",
    "..LL...LL..",
    "..LL...LL..",
    "..BB...BB..",
    ".BBB...BBB.",
]
LEGS_PASSING = [
    "...LL.LL...",
    "...LL.LL...",
    "...LL.LL...",
    "...BB.BB...",
    "..BBB.BBB..",
]
LEGS_BY_FRAME = [LEGS_CONTACT, LEGS_PASSING, LEGS_CONTACT, LEGS_PASSING]

# Arms, indexed by walk frame: which of the two swings forward (drawn a row
# lower, with the hand showing) and which is back. Frames 0 and 2 are the
# two contact poses and swing opposite arms — that opposition, not the leg
# spread, is what makes the two contacts read as different moments.
ARM_ROWS = 4
ARMS_BY_FRAME = [(1, 0), (0, 0), (0, 1), (0, 0)]

BOB_BY_FRAME = [0, -1, 0, -1]
"""Passing poses lift the figure a pixel — a walk's own vertical bounce."""

FACINGS = ("NE", "NW", "SE", "SW")
"""The 4 isometric movement directions — see Facing in src/render/pixelArt.ts.
"S*" faces toward the camera, "*W" is the horizontal mirror of "*E"."""


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
"""A leader can also be promoted to a hero, and both marks are drawn in that
case, so the pairs are enumerated rather than treated as exclusive."""

FACTIONS = {"player": "playerAccent", "enemy": "enemyAccent"}
"""Walker clothing takes the calibrated faction accents from the palette.
EntityLayer used to keep its own brighter pair of literals — exactly the
drift plan/archived/0089 set out to remove — and the palette's blue is the
original's own faction blue."""

SKIN = (0xE0, 0xB8, 0x8A)
"""Specific to this one sprite; in the shared palette it would only be noise
for the UI that also reads from it."""


def frame_key(faction: str, pose: str, facing: str, frame: int) -> str:
    """The atlas key. Mirrored by walkerFrameKey() in
    src/render/walkerSprites.ts — the two must agree exactly, which the
    round-trip test there checks."""
    return f"walker_{faction}_{pose}_{facing}_{frame}"


def _tones(palette: Palette, clothing: RGB) -> dict[str, RGB]:
    return {
        "h": shade(palette.rgb("bronzeDark"), 0.22),
        "S": SKIN,
        "e": palette.rgb("ink"),
        "C": clothing,
        "c": shade(clothing, -0.3),
        # A full step darker than the tunic, not a hint. At -0.15 the sleeves
        # were the same value as the torso and the figure had no arms.
        "A": shade(clothing, -0.28),
        "s": shade(SKIN, -0.12),
        # Trousers and boots have to stay clearly lighter than the outline.
        # The first pass made both near-black and the outline swallowed the
        # whole lower half of the figure.
        "L": palette.rgb("stoneMid"),
        "B": palette.rgb("stoneShadow"),
    }


def _blit(canvas: Canvas, rows: list[str], top: int, tones: dict[str, RGB], mirror: bool) -> None:
    for row_index, row in enumerate(rows):
        for column, key in enumerate(row):
            if key == ".":
                continue
            x = FRAME_WIDTH - 1 - column if mirror else column
            canvas.px(x, top + row_index, tones[key])


def _arms(canvas: Canvas, tones: dict[str, RGB], top: int, frame: int, mirror: bool) -> None:
    """Sleeves down both sides of the torso, with the forward-swinging one
    dropped a row so its hand clears the hip. Drawn as code rather than in
    the pattern strings because only this part differs per walk frame."""
    left_forward, right_forward = ARMS_BY_FRAME[frame]
    for column, forward in ((2, left_forward), (8, right_forward)):
        x = FRAME_WIDTH - 1 - column if mirror else column
        offset = 1 if forward else 0
        for row in range(ARM_ROWS - 1):
            canvas.px(x, top + row + offset, tones["A"])
        canvas.px(x, top + ARM_ROWS - 1 + offset, tones["s"])


def _plume(canvas: Canvas, tones: dict[str, RGB], color: RGB) -> None:
    """A leader's crest: a tuft rising from the crown, on the centerline so
    it stays put under mirroring."""
    center = FRAME_WIDTH // 2
    canvas.px(center, 1, shade(color, 0.35))
    canvas.px(center, 2, color)
    canvas.px(center - 1, 2, color)
    canvas.px(center + 1, 2, color)
    canvas.px(center, 3, color)


def _sword(canvas: Canvas, tones: dict[str, RGB], palette: Palette, top: int, mirror: bool) -> None:
    """A knight's blade held upright: a hilt at the hand and a blade above
    it. The old version was a 1x4 rectangle beside the body; at this size
    there is room for the blade to actually taper into a crossguard."""
    column = 9
    x = FRAME_WIDTH - 1 - column if mirror else column
    blade = palette.rgb("stoneHighlight")
    edge = palette.rgb("stoneLight")
    guard = palette.rgb("bronzeLight")
    for row in range(6):
        canvas.px(x, top - 3 + row, blade if row else edge)
    canvas.px(x - 1 if not mirror else x + 1, top + 3, guard)
    canvas.px(x, top + 3, guard)
    canvas.px(x, top + 4, palette.rgb("bronzeDark"))


SHIELD = [
    ".RR.",
    "RFFR",
    "RFBR",
    "RFFR",
    ".RR.",
    "..R.",
]
"""A kite shield, 4x6 — R rim, F face, B boss. Wide enough to break the
walker's silhouette so the role reads from shape alone, not only color."""


def _shield(canvas: Canvas, tones: dict[str, RGB], palette: Palette, top: int, mirror: bool) -> None:
    colors = {
        "R": palette.rgb("bronzeDark"),
        "F": palette.rgb("bronzeMid"),
        "B": palette.rgb("bronzeLight"),
    }
    for row_index, row in enumerate(SHIELD):
        for column, key in enumerate(row):
            if key == ".":
                continue
            base = 7 + column
            x = FRAME_WIDTH - 1 - base if mirror else base
            canvas.px(x, top + row_index, colors[key])


def render_frame(palette: Palette, faction: str, pose: Pose, facing: str, frame: int) -> Image.Image:
    toward_camera = facing[0] == "S"
    mirror = facing[1] == "W"
    tones = _tones(palette, palette.rgb(FACTIONS[faction]))

    canvas = Canvas(FRAME_WIDTH, FRAME_HEIGHT)
    top = BODY_TOP + BOB_BY_FRAME[frame]

    _blit(canvas, HEAD_FRONT if toward_camera else HEAD_BACK, top, tones, mirror)
    _blit(canvas, TORSO, top + 5, tones, mirror)
    _blit(canvas, LEGS_BY_FRAME[frame], top + 9, tones, mirror)
    # Arms last: the forward-swinging one reaches a row into the hips, and
    # drawing the legs over it erased the hand that gives the arm its end.
    _arms(canvas, tones, top + 6, frame, mirror)

    if pose.leader:
        _plume(canvas, tones, palette.rgb(FACTIONS[faction]))
    if pose.hero == "knight":
        _sword(canvas, tones, palette, top + 6, mirror)
    elif pose.hero == "guardian":
        _shield(canvas, tones, palette, top + 6, mirror)

    canvas.outline(palette.rgb("ink"))
    return canvas.to_image()


def render_all(palette: Palette) -> dict[str, Image.Image]:
    frames: dict[str, Image.Image] = {}
    for faction in FACTIONS:
        for pose in POSES:
            for facing in FACINGS:
                for frame in range(WALK_FRAMES):
                    frames[frame_key(faction, pose.name, facing, frame)] = render_frame(
                        palette, faction, pose, facing, frame
                    )
    return frames
