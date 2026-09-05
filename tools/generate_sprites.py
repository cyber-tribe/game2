"""Generates the committed sprite atlas from the drawing code in tools/sprites/.

Same contract as generate_palette.py: the output is committed, so neither
the game's build nor a contributor without Python needs this script — it is
only needed to change the art. `npm run sprites:check` (run in CI) fails if
the committed atlas no longer matches what the source would produce.

That check matters more here than it does for the palette. A PNG is opaque
in a diff, so the reviewable artifact is the Python that draws it; the check
is what makes "review the source, trust the binary" actually safe.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from palette import load  # noqa: E402
from sprites import atlas, houses, walkers  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
# Under src/, not public/: Vite then owns the URL, so the atlas picks up the
# production base path (/game2/, see vite.config.ts) and a content hash for
# cache-busting automatically. A file in public/ would be copied verbatim and
# would need both handled by hand.
OUT_DIR = REPO_ROOT / "src" / "assets" / "sprites"

# Walkers and buildings are packed separately rather than into one sheet:
# their frame sizes differ by a factor of five, and a single uniform grid
# would pad every 11x18 walker out to 56x56.
SHEETS = {"walkers": walkers.render_all, "houses": houses.render_all}


def build() -> dict[str, tuple[Image.Image, str]]:
    """Every sheet, as (image, serialized descriptor) keyed by sheet name."""
    palette = load()
    output: dict[str, tuple[Image.Image, str]] = {}

    for name, render_all in SHEETS.items():
        sheet, meta = atlas.pack(render_all(palette), f"{name}.png")
        output[name] = (sheet, json.dumps(meta, indent=2, sort_keys=True) + "\n")

    return output


def _png_matches(path: Path, sheet: Image.Image) -> bool:
    """Compares the *decoded pixels*, not the file's bytes.

    PNG bytes depend on the zlib build doing the compressing, so a byte
    comparison fails on a machine whose zlib differs from the one that
    produced the committed file — a false alarm about art that is in fact
    identical. Pixels are what the check is actually about.
    """
    if not path.exists():
        return False
    with Image.open(path) as committed:
        return committed.convert("RGBA").tobytes() == sheet.convert("RGBA").tobytes()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit non-zero if a committed atlas is stale")
    args = parser.parse_args()

    sheets = build()
    stale = [
        name
        for name, (sheet, json_text) in sheets.items()
        if not _png_matches(OUT_DIR / f"{name}.png", sheet)
        or not (OUT_DIR / f"{name}.json").exists()
        or (OUT_DIR / f"{name}.json").read_text(encoding="utf-8") != json_text
    ]

    if args.check:
        if stale:
            for name in stale:
                print(f"out of date: {(OUT_DIR / name).relative_to(REPO_ROOT)}.png / .json", file=sys.stderr)
            print("\nRun `npm run sprites` and commit the result.", file=sys.stderr)
            return 1
        print("sprite atlases are up to date")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in stale:
        sheet, json_text = sheets[name]
        atlas.write(sheet, json_text, OUT_DIR / f"{name}.png", OUT_DIR / f"{name}.json")
        print(f"wrote {name}.png and {name}.json")
    if not stale:
        print("sprite atlases already up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
