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
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from palette import load  # noqa: E402
from sprites import atlas, walkers  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
# Under src/, not public/: Vite then owns the URL, so the atlas picks up the
# production base path (/game2/, see vite.config.ts) and a content hash for
# cache-busting automatically. A file in public/ would be copied verbatim and
# would need both handled by hand.
OUT_DIR = REPO_ROOT / "src" / "assets" / "sprites"
PNG_NAME = "walkers.png"
PNG_PATH = OUT_DIR / PNG_NAME
JSON_PATH = OUT_DIR / "walkers.json"


def build() -> tuple[bytes, str]:
    palette = load()
    sheet, meta = atlas.pack(walkers.render_all(palette), PNG_NAME)

    buffer = io.BytesIO()
    sheet.save(buffer, format="PNG", optimize=True)

    import json

    return buffer.getvalue(), json.dumps(meta, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit non-zero if the committed atlas is stale")
    args = parser.parse_args()

    png_bytes, json_text = build()
    stale = [
        path
        for path, wanted in ((PNG_PATH, png_bytes), (JSON_PATH, json_text.encode("utf-8")))
        if not path.exists() or path.read_bytes() != wanted
    ]

    if args.check:
        if stale:
            for path in stale:
                print(f"out of date: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
            print("\nRun `npm run sprites` and commit the result.", file=sys.stderr)
            return 1
        print("sprite atlas is up to date")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PNG_PATH.write_bytes(png_bytes)
    JSON_PATH.write_text(json_text, encoding="utf-8")
    print(f"wrote {PNG_PATH.relative_to(REPO_ROOT)} and {JSON_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
