"""Draws the command-panel icons.

Replaces the procedural drawing in src/ui/pixelIcons.ts (fillCircle,
drawLine, fillMountain and friends). Held up against the panel at actual
size, roughly half of those icons did not read: 集結, 戦闘, 地震, 最終決戦
and 騎士化 were sparse scatterings of pixels with no recognizable
silhouette, and nearly all of them used tones close enough to the stone
button field that they washed out.

Written as explicit 16x16 patterns rather than as drawing calls. At this
size an icon *is* its pixels — there is no shape to compute — so the
pattern is both the source and the review artifact. Two rules run through
all of them:

1. **Every icon has an ink outline.** The button field is mid-tone stone
   (#7f6f4d); anything without a dark edge sinks into it.
2. **The silhouette carries the meaning.** Color is a second channel
   (lava orange, water teal, faction blue), never the only one — the panel
   dims disabled buttons, and an icon that relied on hue would stop
   reading exactly when the player most needs to know what it is.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from palette import Palette  # noqa: E402

from .canvas import RGB, Canvas  # noqa: E402

ICON_SIZE = 16
"""Unchanged from the old pixelIcons.ts: the panel's buttons are already
sized around a 16px icon, and this pass is about legibility, not scale."""

# Character legend, resolved against the shared palette in _tones().
#
#   o ink outline    S stone highlight   s stone light    d stone dark
#   b bronze light   B bronze mid        w water light    W water mid
#   g grass          G grass dark        r warning red       m mana           M mana highlight
#   k skin           f faction blue
LEGEND = {
    "o": "ink",
    "S": "stoneHighlight",
    "s": "stoneLight",
    "d": "stoneDark",
    "b": "bronzeLight",
    "B": "bronzeMid",
    "w": "waterLight",
    "W": "waterMid",
    "g": "grassMid",
    "G": "grassDark",
    "r": "warning",
    "m": "manaAccent",
    "M": "manaHighlight",
    "f": "playerAccent",
}

SKIN: RGB = (0xE0, 0xB8, 0x8A)


def _tones(palette: Palette) -> dict[str, RGB]:
    tones = {key: palette.rgb(name) for key, name in LEGEND.items()}
    tones["k"] = SKIN
    return tones


# Terrain tools. raise/lower/flatten share one mountain so the three read as
# a set acting on the same thing, differing only in the arrow.
ICONS: dict[str, list[str]] = {
    "raise": [
        "................",
        ".......oo.......",
        "......oSSo......",
        ".....oSSSSo.....",
        "....oSSSSSSo....",
        "...ooooSSoooo...",
        "......oSSo......",
        "......oSSo......",
        "......oooo......",
        "................",
        "......oooo......",
        ".....oSSddo.....",
        "...ooSSSdddoo...",
        "..oSSSSSddddo...",
        ".oSSSSSSdddddo..",
        ".oooooooooooooo.",
    ],
    "lower": [
        "................",
        "......oooo......",
        "......oSSo......",
        "......oSSo......",
        "...ooooSSoooo...",
        "....oSSSSSSo....",
        ".....oSSSSo.....",
        "......oSSo......",
        ".......oo.......",
        "................",
        "......oooo......",
        ".....oSSddo.....",
        "...ooSSSdddoo...",
        "..oSSSSSddddo...",
        ".oSSSSSSdddddo..",
        ".oooooooooooooo.",
    ],
    "flatten": [
        "................",
        "..oooo....oooo..",
        "..obbo....obbo..",
        "..obbo....obbo..",
        ".oobbboo.oobbboo",
        ".obbbbbo.obbbbbo",
        "..obbbo...obbbo.",
        "...obo.....obo..",
        "....o.......o...",
        "................",
        "..oooooooooooo..",
        ".oSSSSSSSSSSSSo.",
        ".oSSSSSSSSSSSSo.",
        ".oddddddddddddo.",
        "..oooooooooooo..",
        "................",
    ],
    # 自動整地 — the plot, not the act. Four corner posts staking out the
    # ground around a house is what this command actually does; reusing the
    # flatten icon's arrows would have said "level land" without saying
    # *where*, which is the only thing separating the two buttons.
    "autoFlatten": [
        "ooo..........ooo",
        "oSo..........oSo",
        "ooo..........ooo",
        "................",
        ".......oo.......",
        "......obbo......",
        ".....obbbbo.....",
        "....obbbbbbo....",
        "...oooooooooo...",
        ".....oddddo.....",
        ".....oddddo.....",
        ".....oooooo.....",
        "................",
        "ooo..........ooo",
        "oSo..........oSo",
        "ooo..........ooo",
    ],
    # A slab split by a crack that actually runs through it. The old icon
    # scattered short strokes across the tile with no ground under them, so
    # there was nothing for the crack to be a crack *in*.
    "earthquake": [
        "................",
        "................",
        ".........oo.....",
        "........oo......",
        "..oooooooooooo..",
        ".oSSSSSSoSSSSSo.",
        ".oSSSSSoSSSSSSo.",
        ".oSSSSSSoSSSSSo.",
        ".oSSSSSSSoSSSSo.",
        ".oddddddoddddddo",
        ".odddddoddddddo.",
        ".oddddddoddddddo",
        "..ooooooooooooo.",
        "......oo........",
        ".......oo.......",
        "................",
    ],
    "swamp": [
        "................",
        "................",
        "....oo....oo....",
        "...oMo...oMo....",
        "....o.....o.....",
        "..oooooooooooo..",
        ".odddmdddmdddo..",
        "odmdddmdddddmdo.",
        "odddoddddoddddo.",
        "odmdddddmddddo..",
        ".oddmdddddmddo..",
        "..odddmdddddo...",
        "...ooddddddo....",
        ".....oooooo.....",
        "................",
        "................",
    ],
    # 聖水の泉: a jet rising out of a bright basin. The only icon in the
    # panel drawn entirely in the water tones, and the only one that is not
    # a weapon, a hazard or a tool — which is the point: it takes rather
    # than destroys.
    "holyWater": [
        ".......oo.......",
        "......oSSo.S....",
        "...S..oSSo......",
        "......oSSo..S...",
        "......oSSo......",
        "......oSSo......",
        "......oSSo......",
        "..oooooooooooo..",
        "..owSwwwwwSwSo..",
        "..oWWWWWWWWWWo..",
        "...oWWWWWWWWo...",
        "....oWWWWWWo....",
        "....oooooooo....",
        "................",
        "................",
        "................",
    ],
    # A dark rock cone with a bright plume over it. The first version made
    # the cone almost white and the plume two stray pixels, so it read as a
    # tent — the lava has to be the loudest thing in the tile.
    # 森: a stand of trees, not one tree — the miracle plants an area, and
    # the pair with 火の雨 is about how far the fire runs through it.
    "forest": [
        "................",
        ".....o....o.....",
        "....ogo..ogo....",
        "...oggo..oggo...",
        "..oggggooggggo..",
        "..oggggggggggo..",
        "...oggoggoggo...",
        "....ooBoogoo....",
        "...ogggoBoggo...",
        "..oggggogoggo...",
        "..oggggggggo....",
        "...oggogggo.....",
        "....oBoBoo......",
        "....oBoBo.......",
        "....ooooo.......",
        "................",
    ],
    # 花: a bloom opening. The only miracle that repairs, so it is the only
    # icon built from a soft rounded shape rather than an edge or a blade.
    "flower": [
        "................",
        "......oo........",
        ".....obbo.......",
        "..oo.obbo.oo....",
        ".obbooBBoobbo...",
        ".obbbBbbBbbbo...",
        "..obBbbbbBbo....",
        "...obbbbbbo.....",
        "..obbbBBbbbo....",
        ".obbboBBobbbo...",
        ".obbo.oo.obbo...",
        "..oo..gg..oo....",
        "......ogo.......",
        ".....gogog......",
        "....ogo.ogo.....",
        ".....o...o......",
    ],
    # 火の雨: flame falling, over ground that is already alight.
    # 竜巻: a funnel, wide at the top and narrow at the ground, banded so it
    # reads as spinning rather than as a cone. The only icon in the panel
    # whose subject keeps moving after the cast.
    "tornado": [
        "................",
        "...oooooooooo...",
        "..odssssssssSd..",
        "..ossssssssssod.",
        "...odssssssSd...",
        "...osssssssso...",
        "....odssssSo....",
        "....osssssso....",
        ".....odssSo.....",
        ".....osssso.....",
        "......odsSo.....",
        "......osso......",
        "......odSo......",
        "......osso......",
        ".......oo.......",
        "................",
    ],
    # ハリケーン: three swept gusts blowing right, each curling at its end.
    # Horizontal where the tornado's icon is vertical, because the one thing
    # a player has to read off this miracle is that it has a direction.
    # 火柱: a standing column of flame over the dead ground it leaves. The
    # tornado's icon is the same silhouette in stone tones; this one is the
    # one that burns, and the scorched strip under it is the difference.
    "firePillar": [
        "......oooo......",
        ".....oorroo.....",
        ".....orrrro.....",
        "....oorrrroo....",
        "....orrbbrro....",
        "...oorrbbrroo...",
        "...orrbSSbrro...",
        "...orrbSSbrro...",
        "...orrrbbrrro...",
        "...oorrrrrroo...",
        "....orrrrrro....",
        "..oooooooooooo..",
        ".oddddddddddddo.",
        "...oddddddddo...",
        "..oooooooooooo..",
        "................",
    ],
    # 雷: one bold bolt. The panel's only pure zigzag.
    "lightning": [
        "........ooo.....",
        ".......oobo.....",
        ".......obSo.....",
        "......ooboo.....",
        "......obSo......",
        ".....oobooo.....",
        "....oobSobo.....",
        "....obSoboo.....",
        "....oobboo......",
        "....obbSo.......",
        "....ooboo.......",
        "....obSo........",
        "...ooboo........",
        "...obSo.........",
        "...oboo.........",
        "...ooo..........",
    ],
    # 嵐: a cloud with bolts hanging under it — weather rather than a
    # strike, which is exactly the difference between it and 雷.
    "storm": [
        "................",
        "....oooooooo....",
        "...oossssssoo...",
        ".oooddddddddooo.",
        ".oddsdsddsddddo.",
        ".odddddddddsddo.",
        ".ooddddddddddoo.",
        "..oooooooooooo..",
        "....oobo.oobo...",
        "....obbo.obbo...",
        "...oobooooboo...",
        "...oboo.oboo....",
        "...ooo..ooo.....",
        "................",
        "................",
        "................",
    ],
    # 病原菌: a microbe. Sickly green where 毒カビ is purple — the two are
    # both "something spreads", and a player must never mistake the one that
    # eats their land for the one that quietly stops their economy.
    "plague": [
        ".......ooo......",
        ".......oGo......",
        "..ooo..oGo..ooo.",
        "..oGoooooooooGo.",
        "..ooGoGGGGGoGoo.",
        "...ooGGgggGGoo..",
        "...oGGoggggGGo..",
        "ooooGgggggogGooo",
        "oGGoGgggggggGoGG",
        "ooooGgogggggGooo",
        "...oGGgogogGGo..",
        "...ooGGgggGGoo..",
        "..ooGoGGGGGoGoo.",
        "..oGoooooooooGo.",
        "..ooo..oGo..ooo.",
        ".......oGo......",
    ],
    "hurricane": [
        "................",
        "................",
        "...ooooooooo....",
        "..oSSSSSSSSSo...",
        "...oooooooooSo..",
        "..........oSo...",
        ".oooooooooooo...",
        "oSSSSSSSSSSSSo..",
        ".ooooooooooooSo.",
        "..........oSSo..",
        "...oooooooooo...",
        "..oSSSSSSSSo....",
        "...ooooooooSo...",
        ".........oSo....",
        "..........o.....",
        "................",
    ],
    "fireRain": [
        "................",
        "..o....o....o...",
        ".obo..obo..obo..",
        ".obo..obo..obo..",
        "..o....o....o...",
        "................",
        "...o...o...o....",
        "..obo.obo.obo...",
        "..obo.obo.obo...",
        "...o...o...o....",
        "................",
        "...oo..oo..oo...",
        "..obbooobboobo..",
        ".obrbobbrbobrbo.",
        "obrrbobrrbobrrbo",
        ".oooooooooooooo.",
    ],
    "volcano": [
        "................",
        "....o.....o.....",
        "...obo...obo....",
        "....o.obo.o.....",
        "......obo.......",
        "....oobbboo.....",
        "....obbbbbo.....",
        "...oobbbbboo....",
        "...osobbbosdo...",
        "..ossobbbosddo..",
        "..osssobosdddo..",
        ".ossssoboddddo..",
        ".ossssssdddddo..",
        "osssssssddddddo.",
        "ossssssssdddddo.",
        ".oooooooooooooo.",
    ],
    # 岩礁: stone standing out of the water. Deliberately shares the wave
    # band at the bottom with the tsunami icon, since the two commands are
    # played against each other and should read as one pair.
    "reef": [
        "................",
        "................",
        "......oo........",
        ".....oSSo..oo...",
        "....oSSSSooSSo..",
        "...oSSddSSSSddo.",
        "..oSSdddSSddddo.",
        "..oSddddddddddo.",
        "..oddddddddddo..",
        "...ooooooooo....",
        "................",
        "..oooooooooooo..",
        ".owwwoowwwoowwo.",
        "..ooooooooooo...",
        "..oWWWooWWWooWo.",
        "...oooooooooo...",
    ],
    "tsunami": [
        "................",
        "................",
        "..ooo......ooo..",
        ".owwwo....owwwo.",
        "owwwwwo..owwwwwo",
        ".oWWWWWooWWWWWo.",
        "..oWWWWWWWWWWo..",
        "...oooooooooo...",
        "................",
        "..oooooooooooo..",
        ".owwwoowwwoowwo.",
        "..ooooooooooo...",
        "..oWWWooWWWooWo.",
        "...oooooooooo...",
        "................",
        "................",
    ],
    # 渦巻き seen from above: a dark funnel with water turning around it, and
    # one arm sweeping out to the right so it reads as rotating rather than
    # as a ring. Deliberately nothing like 津波's row of waves — the two are
    # the water miracles most often aimed at the same coastline.
    "whirlpool": [
        "................",
        "................",
        ".....oooooo.....",
        "...oowwwwwwooo..",
        "..owwwooooowwwo.",
        ".owwwoWWWWowwwww",
        ".owwoWWoooWWwwwo",
        "owwwoWoooooWwwo.",
        "owwwoWoooooWwo..",
        ".owwoWWoooWWwo..",
        ".owwwoWWWWowwo..",
        "..owwwooooowwo..",
        "...oowwwwwwoo...",
        ".....oooooo.....",
        "................",
        "................",
    ],
    "armageddon": [
        "................",
        "....oooooo......",
        "...oSSSSSSo.....",
        "..oSSSSSSSSo....",
        "..oSooSSooSo....",
        "..oSooSSooSo....",
        "..oSSSSSSSSo....",
        "..oSSoSSoSSo....",
        "...oSSSSSSo.....",
        "....oSoSoSo.....",
        "....oooooooo....",
        "...orooooooro...",
        "..oro......oro..",
        "..oo........oo..",
        "................",
        "................",
    ],
}


ICONS.update({
    # Hero promotions: a sword and a shield, the same two marks the walker
    # sprites carry (tools/sprites/walkers.py), so the button and the unit
    # it produces are recognizably the same thing.
    # Upright, thick, and the same blade the promoted walker carries. The
    # old icon ran a 1px diagonal across the tile and read as a scratch.
    # ペルセウス: the blade the nameless 騎士 carried before the heroes had
    # names. Unchanged on purpose — the original's "基準の英雄" should look
    # like the thing the other three are measured against.
    "perseus": [
        "................",
        ".......oo.......",
        "......oSSo......",
        "......oSSo......",
        "......oSSo......",
        "......oSSo......",
        "......oSSo......",
        "......oSSo......",
        "...ooooSSoooo...",
        "..obbbbbbbbbo...",
        "...ooooBBoooo...",
        "......oBBo......",
        "......oBBo......",
        ".....obbbbo.....",
        ".....oBBBBo.....",
        "......oooo......",
    ],
    # ヘラクレス: a studded mace. Mass at the top, like the walker's own club.
    "hercules": [
        "................",
        "....oooooooo....",
        "...oBBBBBBBBo...",
        "...oBbbSbbbBo...",
        "...oBbSbbSbBo...",
        "...oBbbbbbbBo...",
        "...oBbbbSbbBo...",
        "...oBBBBBBBBo...",
        "....oooooooo....",
        "......oddo......",
        "......oddo......",
        "......oddo......",
        "......oddo......",
        "......oddo......",
        "......oddo......",
        "......oooo......",
    ],
    # オディッセウス: a strung bow — the only curve in the panel.
    "odysseus": [
        "......o.........",
        ".....oBo........",
        "...oBo.S........",
        "..oBo..S........",
        ".oBo...S........",
        ".oBo...S........",
        ".oBo...Sooooooo.",
        ".oBo...Sssssssso",
        ".oBo...Sooooooo.",
        ".oBo...S........",
        ".oBo...S........",
        "..oBo..S........",
        "...oBo.S........",
        ".....oBo........",
        "......o.........",
        "................",
    ],
    # アキレス: a spear whose head burns. Fire cannot kill him; he carries it.
    "achilles": [
        "........o.......",
        ".......oro......",
        "......orbro.....",
        "......orbro.....",
        "......orrro.....",
        ".......oro......",
        ".......oBo......",
        ".......odo......",
        ".......odo......",
        ".......odo......",
        ".......odo......",
        ".......odo......",
        ".......odo......",
        ".......odo......",
        ".......odo......",
        ".......ooo......",
    ],
    # アドニス: two crossed blades. Every other hero's icon is one weapon;
    # this is the hero that becomes two, and the panel should say so before
    # the first fight does.
    "adonis": [
        "................",
        "..ooo......ooo..",
        "..oSoo....ooSo..",
        "..ooSoo..ooSoo..",
        "...ooSooooSoo...",
        "....ooSooSoo....",
        ".....ooSSoo.....",
        ".....ooSSoo.....",
        "....ooSooSoo....",
        "...ooSooooSoo...",
        "...oSoo..ooSo...",
        "...ooBo..oBoo...",
        "...oBoo..ooBo...",
        "...obo....obo...",
        "...ooo....ooo...",
        "................",
    ],
    # トロイのヘレン: a hand mirror. The only hero icon that is not a weapon,
    # because the only thing this hero's panel entry has to say is that she
    # does not fight.
    "helen": [
        "................",
        ".......o........",
        "....ooobooo.....",
        "...oobbSbsoo....",
        "...obssSSSbo....",
        "...obsSSSSbo....",
        "..obSSSSSSSbo...",
        "...obSSSSSbo....",
        "...obSSSSSbo....",
        "...oobbSbboo....",
        "....ooobooo.....",
        "......oBo.......",
        "......oBo.......",
        "......oBo.......",
        "......oBo.......",
        "......ooo.......",
    ],
    "guardian": [
        "................",
        "...oooooooo.....",
        "..oBBBBBBBBo....",
        "..oBbbbbbbBo....",
        "..oBbBBBBbBo....",
        "..oBbBbbBbBo....",
        "..oBbBbbBbBo....",
        "..oBbBBBBbBo....",
        "..oBbbbbbbBo....",
        "..oBBBBBBBBo....",
        "...oBBBBBBo.....",
        "....oBBBBo......",
        ".....oBBo.......",
        "......oo........",
        "................",
        "................",
    ],
    # Rally point. The same pennant-on-a-pole a building flies, so "where my
    # people gather" reads as the same visual language as "whose house".
    "shrine": [
        "................",
        "...oo...........",
        "...ofoooooo.....",
        "...offffffo.....",
        "...offffffo.....",
        "...offffo.......",
        "...offo.........",
        "...oo...........",
        "...oo...........",
        "...oo...........",
        "...oo...........",
        "...oo...........",
        "..oooo..........",
        ".odddddo........",
        ".oooooooo.......",
        "................",
    ],
    "settle": [
        "................",
        "................",
        ".......oo.......",
        "......oSSo......",
        ".....oSSSSo.....",
        "....oSSSSSSo....",
        "...oSSSSSSSSo...",
        "..oSSSSSSSSSSo..",
        ".oooooooooooooo.",
        "..ossssssssso...",
        "..ossooooosso...",
        "..ossoddosso....",
        "..ossoddosso....",
        "..ossoddosso....",
        "..oooooooooo....",
        "................",
    ],
    # A ring, not a filled disc: a lens you can see through is what makes a
    # magnifier read as one.
    "inspect": [
        "................",
        "....oooooo......",
        "...oSSSSSSo.....",
        "..oSSoooSSo.....",
        "..oSo.w.oSo.....",
        "..oSo...oSo.....",
        "..oSo...oSo.....",
        "..oSSoooSSo.....",
        "...oSSSSSSo.....",
        "....oooSSSo.....",
        "......oSSSSo....",
        ".......oSSSSo...",
        "........oSSSSo..",
        ".........oSSSo..",
        "..........ooo...",
        "................",
    ],
})


# Behaviour-mode icons. All four are about *people*, so all four are built
# from the same little figure — what changes is what it is doing, which is
# the distinction the buttons actually express.
FIGURE = [
    "..ooo..",
    ".okkko.",
    ".okkko.",
    "..ooo..",
    ".offfo.",
    "offfffo",
    "offfffo",
    ".offfo.",
    ".oo.oo.",
    ".od.do.",
    ".oo.oo.",
]


def _figure(canvas: Canvas, tones: dict[str, RGB], left: int, top: int, rows: list[str] | None = None) -> None:
    for y, row in enumerate(rows or FIGURE):
        for x, key in enumerate(row):
            if key != ".":
                canvas.px(left + x, top + y, tones[key])


ICONS.update({
    # Gather: two figures converging on a point, drawn as arrows rather than
    # as more figures — the old icon was a scatter of dots with no direction
    # in it at all, which is the one thing "gather" has to convey.
    # Two arrows closing on a post. The first attempt used four diagonals,
    # which at 16px met in the middle and read as a plain X — no inward
    # direction, which is the whole meaning of the command.
    "gather": [
        "................",
        "................",
        ".......oo.......",
        ".......oo.......",
        "....o..oo..o....",
        "...oo..oo..oo...",
        "..obo..oo..obo..",
        ".obbooooooooobo.",
        ".obbooooooooobo.",
        "..obo..oo..obo..",
        "...oo..oo..oo...",
        "....o..oo..o....",
        ".......oo.......",
        ".......oo.......",
        "................",
        "................",
    ],
    # Merge: the same converging arrows as 集結, but closing on a *person*
    # rather than on a post. That is exactly the difference between the two
    # orders — 集合 sends everyone to a place, 合体 sends them into each
    # other — so the two icons deliberately share a shape and differ only in
    # what sits between the arrows.
    "merge": [
        "................",
        "................",
        "................",
        "......ooo.......",
        ".....okkko......",
        "o....okkko....o.",
        "oo....ooo....oo.",
        "obo..offfo..obo.",
        "obbooffffffoobbo",
        "obo.offfffo.obo.",
        "oo...offfo...oo.",
        "o....oo.oo....o.",
        ".....od.do......",
        ".....oo.oo......",
        "................",
        "................",
    ],
    # Fight: crossed blades. The old icon was a thin bent line that read as
    # nothing; two crossed swords are unmistakable even at 16px.
    "fight": [
        "................",
        ".oo..........oo.",
        "oSSo........oSSo",
        ".oSSo......oSSo.",
        "..oSSo....oSSo..",
        "...oSSo..oSSo...",
        "....oSSooSSo....",
        ".....oSSSSo.....",
        ".....oSSSSo.....",
        "....oSSooSSo....",
        "...oBSo..oSBo...",
        "..obBo....oBbo..",
        "..oBo......oBo..",
        "..obo......obo..",
        "..ooo......ooo..",
        "................",
    ],
})


ICONS.update({
    # Go to rally point: the figure plus the pennant it is heading for.
    "goToShrine": [
        "................",
        "..........oo....",
        "..........ofooo.",
        "..ooo.....offfo.",
        ".okkko....offo..",
        ".okkko....oo....",
        "..ooo.....oo....",
        ".offfo....oo....",
        "offfffobbooo....",
        "offfffo...oo....",
        ".offfo....oo....",
        ".oo.oo....oo....",
        ".od.do...oooo...",
        ".oo.oo..odddo...",
        "........oooooo..",
        "................",
    ],
    # Release population: a figure stepping out through a doorway.
    "sprog": [
        "................",
        "..oooooo........",
        "..oSSSSo........",
        "..oSooSo..ooo...",
        "..oSooSo.okkko..",
        "..oSooSo.okkko..",
        "..oSooSo..ooo...",
        "..oSooSo.offfo..",
        "..oSooSooffffo..",
        "..oSooSooffffo..",
        "..oSooSo.offfo..",
        "..oSooSo.oo.oo..",
        "..oSooSo.od.do..",
        "..oSooSo.oo.oo..",
        "..oooooo........",
        "................",
    ],
    # 救出: a life ring. The one per-stage ○× that grants an operation
    # rather than taking one away, so it wants a silhouette that reads as
    # help rather than as a hazard — and a ring is legible at 16px in a way
    # a swimmer is not.
    "rescue": [
        "................",
        ".....oooooo.....",
        "...oorrrSSSoo...",
        "..oorrrrSSSSoo..",
        "..orrrooooSSSo..",
        ".orrro....oSSSo.",
        ".orro......oSSo.",
        ".orro......oSSo.",
        ".oSSo......orro.",
        ".oSSo......orro.",
        ".oSSSo....orrro.",
        "..oSSSoooorrro..",
        "..ooSSSSrrrroo..",
        "...ooSSSrrroo...",
        ".....oooooo.....",
        "................",
    ],
    # Status-row icons: mana as a charged orb, population as a pair.
    "mana": [
        "................",
        "......oo........",
        ".....oMMo.......",
        "....oMMMMo......",
        "...oMMmmMMo.....",
        "..oMmmmmmmMo....",
        "..oMmmmmmmmo....",
        ".oMmmmmmmmmmo...",
        ".oMmmmmmmmmmo...",
        ".ommmmmmmmmmo...",
        "..ommmmmmmmo....",
        "..ommmmmmmmo....",
        "...ommmmmmo.....",
        "....oooooo......",
        "................",
        "................",
    ],
    "population": [
        "................",
        "..ooo.....ooo...",
        ".okkko...okkko..",
        ".okkko...okkko..",
        "..ooo.....ooo...",
        ".offfo...offfo..",
        "offfffo.offfffo.",
        "offfffo.offfffo.",
        ".offfo...offfo..",
        ".oo.oo...oo.oo..",
        ".od.do...od.do..",
        ".oo.oo...oo.oo..",
        "................",
        "................",
        "................",
        "................",
    ],
    # 道: a paved way running toward the horizon. Perspective rather than a
    # flat strip — at 16px a plain rectangle of stone reads as a wall, and
    # the courses of laid stone are what say "road" rather than "floor".
    "road": [
        "................",
        "......oooo......",
        "......osdo......",
        "......osdo......",
        "......osdo......",
        ".....oddddo.....",
        ".....odssso.....",
        ".....odssso.....",
        "....osdsssdo....",
        "....oddddddo....",
        "...osdssdssdo...",
        "...osdssdssdo...",
        "...osdssdssdo...",
        "..oddddddddddo..",
        "..osdsssdsssdo..",
        ".ossdsssdsssdso.",
    ],
    # 城壁: a battlemented stone wall seen face-on. Crenellations are what
    # say "wall" rather than "floor" or "crate" at 16px — the courses of
    # block below them only work once the top edge is broken.
    "wall": [
        "................",
        "................",
        "................",
        "..ooo.ooo.ooo...",
        "..oso.oso.oso...",
        "..oso.oso.oso...",
        "..oooooooooooo..",
        "..osssdsssdsso..",
        "..oddddddddddo..",
        "..osdsssdsssdo..",
        "..oddddddddddo..",
        "..osssdsssdsso..",
        "..oooooooooooo..",
        "................",
        "................",
        "................",
    ],
    # 地下巨石: one big domed stone heaved up through cracked ground. The
    # broken ground line under it is what separates this from any other
    # rock in the set — the stone came from below, it was not put there.
    "megalith": [
        "................",
        "................",
        "................",
        "......oooo......",
        "....ossSSSSo....",
        "...ossssSSSSo...",
        "...osssssSSSo...",
        "..oddsssssSSSo..",
        "..odddsssssSSo..",
        "...odddssssso...",
        "...oddddsssso...",
        ".oooooooooooooo.",
        "..oo..o..o..oo..",
        "................",
        "................",
        "................",
    ],
    # 毒カビ: toadstools with spores drifting off them. Purple (the mana
    # tones) rather than the swamp's own murk, and a hard silhouette of caps
    # and stems, so it never reads as "another swamp" in the panel.
    "fungus": [
        ".........m......",
        ".m..............",
        "..oMMMMMo..m....",
        ".oMMMMMMMo...m..",
        ".oMMMMMMMo......",
        "ommmmmmmmmo...m.",
        "ooooooooooo.....",
        "...ossso..oMMMo.",
        "...ossso.oMMMMMo",
        "...ossso.ommmmmo",
        "...ossso.ooooooo",
        "...ossso...oso..",
        "...ossso...oso..",
        "...ooooo...ooo..",
        "................",
        "................",
    ],
})

# Ordered so the atlas and the contact sheet both follow the panel's own
# left-to-right order rather than dictionary insertion order.
ICON_KINDS = (
    "settle",
    "gather",
    "merge",
    "goToShrine",
    "fight",
    "sprog",
    "rescue",
    "inspect",
    "raise",
    "lower",
    "flatten",
    "autoFlatten",
    "shrine",
    "earthquake",
    "swamp",
    "holyWater",
    "perseus",
    "hercules",
    "odysseus",
    "achilles",
    "adonis",
    "helen",
    "guardian",
    "forest",
    "flower",
    "tornado",
    "firePillar",
    "lightning",
    "storm",
    "plague",
    "hurricane",
    "fireRain",
    "volcano",
    "reef",
    "road",
    "wall",
    "megalith",
    "fungus",
    "tsunami",
    "whirlpool",
    "armageddon",
    "mana",
    "population",
)


def frame_key(kind: str) -> str:
    """The atlas key. Mirrored by iconFrameKey() in src/ui/pixelIcons.ts."""
    return f"icon_{kind}"


def render(palette: Palette, kind: str) -> Image.Image:
    tones = _tones(palette)
    canvas = Canvas(ICON_SIZE, ICON_SIZE)
    for y, row in enumerate(ICONS[kind]):
        for x, key in enumerate(row):
            if key != ".":
                canvas.px(x, y, tones[key])
    return canvas.to_image()


def _validate() -> None:
    """Fails generation on the mistakes a 16x16 pattern table invites.

    These checks used to live in src/ui/pixelIcons.test.ts, against the
    procedural builders. They belong here now: the patterns are the art, so
    a blank or duplicated icon is a defect in *this* file, and CI runs
    `npm run sprites:check`, which builds every sheet and so runs this.
    """
    missing = set(ICON_KINDS) - set(ICONS)
    extra = set(ICONS) - set(ICON_KINDS)
    if missing or extra:
        raise ValueError(f"ICON_KINDS and ICONS disagree: missing={sorted(missing)} extra={sorted(extra)}")

    silhouettes: dict[str, str] = {}
    for kind in ICON_KINDS:
        rows = ICONS[kind]
        if len(rows) != ICON_SIZE or any(len(row) != ICON_SIZE for row in rows):
            raise ValueError(f"{kind}: every icon must be {ICON_SIZE}x{ICON_SIZE}")

        unknown = {c for row in rows for c in row} - set(LEGEND) - {".", "k"}
        if unknown:
            raise ValueError(f"{kind}: characters not in LEGEND: {sorted(unknown)}")

        if all(c == "." for row in rows for c in row):
            raise ValueError(f"{kind}: renders as a blank square")

        silhouette = "|".join(row.replace(".", " ") for row in rows)
        # Two commands that look identical are worse than an ugly icon: the
        # player cannot tell the buttons apart at all.
        if silhouette in silhouettes:
            raise ValueError(f"{kind}: same silhouette as {silhouettes[silhouette]}")
        silhouettes[silhouette] = kind


def render_all(palette: Palette) -> dict[str, Image.Image]:
    _validate()
    return {frame_key(kind): render(palette, kind) for kind in ICON_KINDS}
