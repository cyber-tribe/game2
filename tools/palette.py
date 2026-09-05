"""Loads tools/palette.json — the single source of truth for the game's colors.

Kept separate from generate_palette.py so that the sprite generators added
later can pull the same palette without going through the codegen: a sprite
whose colors drifted from the UI's would defeat the point of having one
palette at all.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

PALETTE_JSON = Path(__file__).resolve().parent / "palette.json"


@dataclass(frozen=True)
class Color:
    key: str
    """camelCase name, used verbatim as the TypeScript key."""
    hex: str
    """Lowercase "#rrggbb"."""
    css: bool
    """Whether this color is also emitted as a CSS custom property."""
    doc: str | None

    @property
    def rgb(self) -> tuple[int, int, int]:
        v = int(self.hex[1:], 16)
        return (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF

    @property
    def css_var(self) -> str:
        """`stoneHighlight` -> `--stone-highlight`. Derived rather than
        spelled out in the JSON so the two names cannot drift apart."""
        out = []
        for ch in self.key:
            if ch.isupper():
                out.append("-")
                out.append(ch.lower())
            else:
                out.append(ch)
        return "--" + "".join(out)


@dataclass(frozen=True)
class Group:
    doc: list[str]
    colors: list[Color]


@dataclass(frozen=True)
class Palette:
    doc: list[str]
    groups: list[Group]

    @property
    def colors(self) -> list[Color]:
        return [c for g in self.groups for c in g.colors]

    def by_key(self) -> dict[str, Color]:
        return {c.key: c for c in self.colors}

    def rgb(self, key: str) -> tuple[int, int, int]:
        """Convenience for the sprite generators: `palette.rgb("stoneMid")`."""
        return self.by_key()[key].rgb


HEX_DIGITS = set("0123456789abcdef")


def load(path: Path = PALETTE_JSON) -> Palette:
    raw = json.loads(path.read_text(encoding="utf-8"))
    groups = [
        Group(
            doc=list(g.get("doc", [])),
            colors=[
                Color(key=c["key"], hex=c["hex"], css=bool(c.get("css", False)), doc=c.get("doc"))
                for c in g["colors"]
            ],
        )
        for g in raw["groups"]
    ]
    palette = Palette(doc=list(raw.get("doc", [])), groups=groups)
    _validate(palette)
    return palette


def _validate(palette: Palette) -> None:
    """Fails loudly on the mistakes that would otherwise surface as a
    confusing TypeScript or CSS error in generated output nobody edits."""
    seen: set[str] = set()
    for color in palette.colors:
        if color.key in seen:
            raise ValueError(f"duplicate palette key: {color.key}")
        seen.add(color.key)
        if not color.key[:1].islower() or not color.key.isalnum():
            raise ValueError(f"palette key must be camelCase alphanumeric: {color.key!r}")
        if len(color.hex) != 7 or color.hex[0] != "#" or not set(color.hex[1:]) <= HEX_DIGITS:
            raise ValueError(f"{color.key}: hex must be lowercase '#rrggbb', got {color.hex!r}")
