import atlasData from "../assets/sprites/icons.json";
import atlasUrl from "../assets/sprites/icons.png";

/**
 * Every command the toolbar needs an icon for — replaces the emoji this
 * project used to lean on (🌋🌊⚔️☠️🔍💥🚩🐸🛡️🚶), which read as OS-native
 * glyphs sitting on top of a pixel-art world rather than part of it (see
 * plan/archived/0084-original-ui-foundation.md).
 */
export type IconKind =
  | "raise"
  | "lower"
  | "flatten"
  | "shrine"
  | "earthquake"
  | "swamp"
  | "holyWater"
  | "tornado"
  | "perseus"
  | "hercules"
  | "odysseus"
  | "achilles"
  | "guardian"
  | "volcano"
  | "forest"
  | "flower"
  | "fireRain"
  | "tsunami"
  | "reef"
  | "road"
  | "fungus"
  | "armageddon"
  | "inspect"
  | "settle"
  | "gather"
  | "goToShrine"
  | "fight"
  | "releasePopulation"
  | "mana"
  | "population";

/** Logical icon resolution — small enough to read as a single "sprite" at 16-bit scale, per plan/0084's pixel-density notes. */
export const ICON_SIZE = 16;

/**
 * Must agree exactly with frame_key() in tools/sprites/icons.py.
 * pixelIcons.test.ts checks every key this can produce against the
 * committed atlas.
 */
export function iconFrameKey(kind: IconKind): string {
  return `icon_${kind}`;
}

/** Every frame key present in the committed atlas. Exported for the test. */
export const ATLAS_FRAME_KEYS: readonly string[] = Object.keys(atlasData.frames);

type Frame = { frame: { x: number; y: number; w: number; h: number } };
const FRAMES = atlasData.frames as Record<string, Frame>;

let sheet: HTMLImageElement | undefined;

/**
 * Decodes the icon atlas. Must resolve before any paintIcon call — main.ts
 * awaits it during startup, alongside the world sprite atlases.
 *
 * The icons used to be built procedurally in this file (fillCircle,
 * drawLine, fillMountain and ~270 lines of per-icon drawing calls). Held up
 * against the real panel, roughly half of them did not read: 集結, 戦闘,
 * 地震, 最終決戦 and 騎士化 were sparse scatterings with no recognizable
 * silhouette. They are drawn as explicit 16x16 patterns now
 * (tools/sprites/icons.py) — at this size an icon *is* its pixels, so the
 * pattern is both the source and the thing a reviewer can judge.
 */
export async function loadCommandIcons(): Promise<void> {
  if (sheet) return;
  const image = new Image();
  image.src = atlasUrl;
  await image.decode();
  sheet = image;
}

/**
 * Paints an icon onto an existing <canvas> (sized to ICON_SIZE, so it
 * scales crisply — see index.html's `image-rendering: pixelated`). Shared
 * by createIconCanvas (a fresh canvas per command button) and callers that
 * already have a fixed placeholder <canvas> in the DOM to paint into (the
 * status row's mana/population icons).
 *
 * A no-op before loadCommandIcons() resolves rather than a throw: an icon
 * missing for a moment beats a startup crash, and the key round-trip test
 * is what catches a genuinely wrong key.
 */
export function paintIcon(canvas: HTMLCanvasElement, kind: IconKind): void {
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const frame = FRAMES[iconFrameKey(kind)]?.frame;
  if (!sheet || !frame) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, 0, 0, ICON_SIZE, ICON_SIZE);
}

/** Renders an icon onto a freshly created <canvas> — see paintIcon. */
export function createIconCanvas(kind: IconKind): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "pixel-icon";
  paintIcon(canvas, kind);
  return canvas;
}
