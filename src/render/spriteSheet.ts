import { Assets, Spritesheet, Texture, type SpritesheetData } from "pixi.js";

/**
 * Shared loading for the generated sprite atlases (see tools/sprites/).
 *
 * Both sheets are built the same way — a uniform grid of frames, keys
 * assembled independently on the Python and TypeScript sides — so the
 * parse, the nearest-neighbour setting and the "not loaded yet" behaviour
 * live here rather than being written twice.
 */
export class SpriteAtlas {
  private sheet?: Spritesheet;

  constructor(
    private readonly url: string,
    private readonly data: unknown,
  ) {}

  async load(): Promise<void> {
    if (this.sheet) return;
    const texture = await Assets.load<Texture>(this.url);
    // Nearest, not linear: these are authored at roughly one art pixel per
    // screen pixel and scaled up for leaders. Bilinear filtering would
    // smear an 11px figure into mush.
    texture.source.scaleMode = "nearest";
    const parsed = new Spritesheet(texture, this.data as SpritesheetData);
    await parsed.parse();
    this.sheet = parsed;
  }

  /**
   * The texture for one frame key, or undefined before load() resolves.
   * Callers skip drawing rather than throwing: a missing sprite for the
   * frame or two before the atlas parses beats a crash, and the key
   * round-trip tests are what catch a genuinely wrong key.
   */
  texture(key: string): Texture | undefined {
    return this.sheet?.textures[key];
  }
}
