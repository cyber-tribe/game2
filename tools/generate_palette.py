"""Generates the game's color definitions from tools/palette.json.

Before this existed the same colors were written out by hand in two places
— `src/render/palette.ts` and the `:root` block in `index.html` — and the
calibration pass in plan/archived/0088 had to edit both. A third copy is
coming (the Python sprite generators), so the duplication is now worth
removing rather than living with.

Outputs, both committed to the repo so neither the app's build nor a
contributor without Python depends on this script:

  src/render/palette.ts   fully generated
  index.html              only the region between the GENERATED markers

Run `npm run palette` to regenerate, `npm run palette:check` to verify the
committed output is current (CI runs the latter).
"""

from __future__ import annotations

import argparse
import sys
import textwrap
from pathlib import Path

from palette import Palette, load

REPO_ROOT = Path(__file__).resolve().parent.parent
TS_OUT = REPO_ROOT / "src" / "render" / "palette.ts"
HTML_OUT = REPO_ROOT / "index.html"

BANNER = "tools/palette.json"
DOC_WIDTH = 96
"""Where a per-color doc comment wraps. Matches the surrounding hand-written
source closely enough that the generated file doesn't stand out."""
CSS_BEGIN = "/* BEGIN GENERATED PALETTE"
CSS_END = "/* END GENERATED PALETTE */"


def render_ts(palette: Palette) -> str:
    lines = ["/**"]
    lines += [f" * {line}".rstrip() for line in palette.doc]
    lines += [
        " *",
        f" * @generated Do not edit by hand — edit {BANNER} and run `npm run palette`.",
        " */",
        "export const GAME_PALETTE = {",
    ]

    for index, group in enumerate(palette.groups):
        if index > 0:
            lines.append("")
        for doc_line in group.doc:
            lines.append(f"  // {doc_line}".rstrip())
        for color in group.colors:
            lines += render_doc_comment(color.doc, indent="  ")
            lines.append(f"  {color.key}: 0x{color.hex[1:]},")

    lines += [
        "} as const;",
        "",
        "export type PaletteColor = keyof typeof GAME_PALETTE;",
        "",
    ]
    return "\n".join(lines)


def render_doc_comment(doc: str | None, indent: str) -> list[str]:
    """A JSDoc block for one color: a one-liner when it fits, otherwise
    wrapped across lines the way the hand-written source used to be."""
    if not doc:
        return []
    single = f"{indent}/** {doc} */"
    if len(single) <= DOC_WIDTH:
        return [single]
    body = textwrap.wrap(doc, width=DOC_WIDTH - len(indent) - 3)
    return [f"{indent}/**"] + [f"{indent} * {line}" for line in body] + [f"{indent} */"]


def render_css_block(palette: Palette, indent: str) -> str:
    lines = [
        f"{indent}{CSS_BEGIN} — edit {BANNER}, then run `npm run palette` */",
    ]
    lines += [f"{indent}{c.css_var}: {c.hex};" for c in palette.colors if c.css]
    lines.append(f"{indent}{CSS_END}")
    return "\n".join(lines)


def splice_css(html: str, palette: Palette) -> str:
    start = html.find(CSS_BEGIN)
    end = html.find(CSS_END)
    if start == -1 or end == -1:
        raise SystemExit(
            f"{HTML_OUT}: could not find the {CSS_BEGIN} / {CSS_END} markers. "
            "They delimit the generated custom properties; restore them before regenerating."
        )
    line_start = html.rfind("\n", 0, start) + 1
    indent = html[line_start:start]
    block_end = end + len(CSS_END)
    return html[:line_start] + render_css_block(palette, indent) + html[block_end:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero if the committed output differs, without writing anything",
    )
    args = parser.parse_args()

    palette = load()
    wanted = {TS_OUT: render_ts(palette), HTML_OUT: splice_css(HTML_OUT.read_text(encoding="utf-8"), palette)}

    stale = [path for path, text in wanted.items() if not path.exists() or path.read_text(encoding="utf-8") != text]

    if args.check:
        if stale:
            for path in stale:
                print(f"out of date: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
            print("\nRun `npm run palette` and commit the result.", file=sys.stderr)
            return 1
        print("palette output is up to date")
        return 0

    for path in stale:
        path.write_text(wanted[path], encoding="utf-8")
        print(f"wrote {path.relative_to(REPO_ROOT)}")
    if not stale:
        print("palette output already up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
