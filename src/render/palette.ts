/**
 * The game's one shared color vocabulary — per the "原作型UI基盤" effort to
 * move game2's look toward the original Populous 2 (stone/bronze/temple
 * relief rather than the modern navy-and-blue web-app palette this project
 * started with). Every UI panel, pixel icon, terrain fill and building
 * sprite pulls its colors from here rather than inventing its own hex
 * literals, so a palette pass only has to touch one file.
 *
 * Unlike the first cut of this file (which was an informed guess, since
 * this environment can't reach the reference screenshots online), the
 * stone/water/accent values are **sampled from original screenshots the
 * user pasted into the conversation**, quantized per-region and
 * cross-checked across all of them — see plan/archived/0088-palette-calibration.md.
 *
 * 1. The UI stone is a khaki sandstone ramp — #4d3c34 / #7f6f4d / #a1916f /
 *    #c4c492 — where #7f6f4d is by far the dominant tone (12% of the border
 *    frame, 9-13% of the command panels), not the pinkish cream used before.
 *    This one held in every single reference shot.
 * 2. Water is a teal blue (#006f90), not a navy (#2a5f8c).
 * 3. The active command tile's accent is an orange (#c4801b), not a gold.
 *
 * **Grass is deliberately NOT the olive/khaki an early pass sampled.** That
 * sample set happened to be weighted toward dry/late-epoch stages; the
 * user, who knows the original, confirmed ordinary turf is a fresh green
 * (新緑), and greens isolated from green-stage shots bear that out
 * (#5b7d47 / #638153 / #7c9864 — green-dominant moss tones, hue ~95°, just
 * washed out by JPEG compression). Those olive tones live on as the desert
 * family below instead. Don't "recalibrate" grass back toward olive off a
 * dry-stage screenshot.
 *
 * @generated Do not edit by hand — edit tools/palette.json and run `npm run palette`.
 */
export const GAME_PALETTE = {
  // Sandstone/limestone — the command panel's frame, background and bevels.
  // A 4-step ramp lifted straight off the original's carved panels.
  stoneHighlight: 0xc4c492,
  stoneLight: 0xa1916f,
  /** The dominant tone of the original's UI panels and map border — the default panel field. */
  stoneMid: 0x7f6f4d,
  stoneDark: 0x6a5a3e,
  stoneShadow: 0x4d3c34,

  // Bronze/metal accents — active command tiles, icon linework, frames.
  // bronzeLight is the original's own highlighted-tile orange.
  bronzeLight: 0xc4801b,
  bronzeMid: 0x8c6a2c,
  bronzeDark: 0x3a2c20,

  // Parchment/paper — text areas, message strip background.
  parchment: 0xc4c492,
  parchmentShadow: 0xa1916f,

  ink: 0x24200f,
  inkFaded: 0x4d3c34,

  // Ordinary turf — a fresh green, nudged very slightly toward the moss
  // hue the green-stage references show (~95°) rather than a pure spring
  // green. See the note at the top of this file before changing these.
  grassLight: 0x86b95a,
  grassMid: 0x4f8a35,
  grassDark: 0x35601f,

  waterLight: 0x1a90b4,
  waterMid: 0x006f90,
  waterDark: 0x004b63,

  /**
   * Sampled off the original's dry/desert stages — the olive-khaki family an early pass mistook
   * for ordinary grass. Also the farmland soil tone.
   */
  soilLight: 0x9f8c6d,
  soilMid: 0x7e683e,
  soilDark: 0x4d3c34,
  /** The dry stages' own ground green, distinct from ordinary turf above. */
  scrubMid: 0x666600,
  scrubDark: 0x4c4d00,

  lavaBright: 0xffe08a,
  lavaMid: 0xe0762a,
  lavaDark: 0x8c2a12,

  // Faction accents — deliberately kept out of building/terrain fills (see
  // plan/archived/0085-isometric-house-sprites.md): used only for flags/banners/small
  // UI swatches, never to tint whole structures or areas. The blue is the
  // original's own walker blue.
  playerAccent: 0x235ebc,
  enemyAccent: 0xb5352f,

  // Status accents shared by icons/meters.
  manaAccent: 0x6a4fc0,
  manaHighlight: 0xa892e0,
  warning: 0xb5352f,
  positive: 0x4f8a35,
} as const;

export type PaletteColor = keyof typeof GAME_PALETTE;
