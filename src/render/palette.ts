/**
 * The game's one shared color vocabulary — per the "原作型UI基盤" effort to
 * move game2's look toward SFC-era Populous 2 (stone/bronze/temple relief
 * rather than the modern navy-and-blue web-app palette this project started
 * with). Every UI panel, pixel icon, and (in later phases) terrain/building
 * sprite should pull its colors from here rather than inventing its own hex
 * literals, so a future palette pass only has to touch one file.
 *
 * These values are a considered best-effort approximation of "ancient
 * Greek stone temple, rendered in a 16-bit palette" — not colors measured
 * off specific reference screenshots (this environment can't fetch the
 * source wiki images to sample from). If real SFC Populous 2 screenshots
 * are pasted into the conversation, these should be revisited against them.
 */
export const GAME_PALETTE = {
  // Stone/limestone — the command panel's own frame and background.
  stoneLight: 0xd8cdb0,
  stoneMid: 0xa89878,
  stoneDark: 0x6e6048,
  stoneShadow: 0x362d1e,

  // Bronze/metal accents — button frames, icon linework.
  bronzeLight: 0xc9a24a,
  bronzeMid: 0x8c6a2c,
  bronzeDark: 0x5a4318,

  // Parchment/paper — text areas, message strip background.
  parchment: 0xede0bf,
  parchmentShadow: 0xb8a878,

  ink: 0x2a2114,
  inkFaded: 0x5a4f3c,

  // Terrain family (grass already has its own dedicated dither texture —
  // see pixelArt.ts — these are for UI accents/icons that reference it).
  grassLight: 0x8fbf5a,
  grassMid: 0x5a9138,
  grassDark: 0x2f5c1e,

  waterLight: 0x8fc7e0,
  waterMid: 0x4a7fb0,
  waterDark: 0x28486e,

  soilLight: 0x9a6a3c,
  soilMid: 0x6e4a26,
  soilDark: 0x402c16,

  lavaBright: 0xffe08a,
  lavaMid: 0xe0762a,
  lavaDark: 0x8c2a12,

  // Faction accents — deliberately kept out of building/terrain fills (see
  // plan/0084-original-ui-foundation.md): used only for flags/banners/small
  // UI swatches, never to tint whole structures or areas.
  playerAccent: 0x3a6fd0,
  enemyAccent: 0xb5352f,

  // Status accents shared by icons/meters.
  manaAccent: 0x6a4fc0,
  manaHighlight: 0xa892e0,
  warning: 0xb5352f,
  positive: 0x5a9138,
} as const;

export type PaletteColor = keyof typeof GAME_PALETTE;
