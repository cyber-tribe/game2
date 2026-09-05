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
import io
import json
import sys
from pathlib import Path

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


def build() -> dict[Path, bytes]:
    palette = load()
    output: dict[Path, bytes] = {}

    for name, render_all in SHEETS.items():
        sheet, meta = atlas.pack(render_all(palette), f"{name}.png")
        buffer = io.BytesIO()
        sheet.save(buffer, format="PNG", optimize=True)
        output[OUT_DIR / f"{name}.png"] = buffer.getvalue()
        output[OUT_DIR / f"{name}.json"] = (json.dumps(meta, indent=2, sort_keys=True) + "\n").encode("utf-8")

    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit non-zero if a committed atlas is stale")
    args = parser.parse_args()

    wanted = build()
    stale = [path for path, data in wanted.items() if not path.exists() or path.read_bytes() != data]

    if args.check:
        if stale:
            for path in stale:
                print(f"out of date: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
            print("\nRun `npm run sprites` and commit the result.", file=sys.stderr)
            return 1
        print("sprite atlases are up to date")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path in stale:
        path.write_bytes(wanted[path])
        print(f"wrote {path.relative_to(REPO_ROOT)}")
    if not stale:
        print("sprite atlases already up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
