/**
 * Short, procedurally synthesized sound effects — one per miracle — played
 * via the Web Audio API rather than bundled audio files (this project ships
 * no binary audio assets). Per the reference game's own design, a miracle's
 * SE fires for *either* side's cast, not just the player's own: a player
 * with the map panned elsewhere still hears "something happened" and can
 * judge from the sound alone whether it's worth reacting to immediately or
 * later — see main.ts's onEnemyAction, which already does this for the
 * screen-shake/toast but had no audio equivalent before this.
 */
export type MiracleSoundType = "shrineMove" | "earthquake" | "swamp" | "volcano" | "knight" | "guardian" | "armageddon" | "flood";

/** Every MiracleSoundType, for tests and any future UI that wants to list them. */
export const MIRACLE_SOUND_TYPES: readonly MiracleSoundType[] = [
  "shrineMove",
  "earthquake",
  "swamp",
  "volcano",
  "knight",
  "guardian",
  "armageddon",
  "flood",
];

interface ToneLayer {
  waveform: OscillatorType;
  startFrequency: number;
  endFrequency: number;
  /** Seconds after the sound starts that this layer begins. */
  delay: number;
  duration: number;
  peakGain: number;
}

interface NoiseLayer {
  delay: number;
  duration: number;
  peakGain: number;
  /** Lowpass filter cutoff (Hz) — lower reads as a dull rumble, higher as a hiss. */
  filterFrequency: number;
}

interface MiracleSoundRecipe {
  tones: ToneLayer[];
  noise?: NoiseLayer;
}

/**
 * One recipe per miracle, roughly scaled to docs/game-system.md's own
 * mana-cost tiers: shrineMove ("小") is a quiet, quick blip; armageddon
 * ("最大") layers two low hits with a noise bed under it. Distinct
 * waveform/frequency-direction combinations (rising vs falling, tonal vs
 * noisy) are chosen so each is recognizable by ear alone, not just by
 * loudness — that's the whole point of a per-miracle SE.
 */
/** Exported for tests to inspect — see e.g. miracleSounds.test.ts. */
export const RECIPES: Record<MiracleSoundType, MiracleSoundRecipe> = {
  shrineMove: {
    tones: [{ waveform: "sine", startFrequency: 500, endFrequency: 900, delay: 0, duration: 0.15, peakGain: 0.15 }],
  },
  earthquake: {
    tones: [{ waveform: "sawtooth", startFrequency: 90, endFrequency: 45, delay: 0, duration: 0.4, peakGain: 0.25 }],
    noise: { delay: 0, duration: 0.35, peakGain: 0.2, filterFrequency: 200 },
  },
  swamp: {
    tones: [{ waveform: "sine", startFrequency: 220, endFrequency: 90, delay: 0, duration: 0.35, peakGain: 0.2 }],
    noise: { delay: 0.05, duration: 0.2, peakGain: 0.08, filterFrequency: 400 },
  },
  volcano: {
    tones: [{ waveform: "sine", startFrequency: 80, endFrequency: 35, delay: 0, duration: 0.6, peakGain: 0.3 }],
    noise: { delay: 0, duration: 0.5, peakGain: 0.3, filterFrequency: 800 },
  },
  knight: {
    tones: [
      { waveform: "square", startFrequency: 700, endFrequency: 500, delay: 0, duration: 0.12, peakGain: 0.22 },
      { waveform: "square", startFrequency: 900, endFrequency: 600, delay: 0.08, duration: 0.1, peakGain: 0.15 },
    ],
  },
  // A low, steady triangle tone plus a short thud — a "shield raised"
  // sound, deliberately calmer than knight's sharp rising-square "clang"
  // to match guardian's defensive, stand-your-ground role.
  guardian: {
    tones: [{ waveform: "triangle", startFrequency: 260, endFrequency: 320, delay: 0, duration: 0.25, peakGain: 0.2 }],
    noise: { delay: 0, duration: 0.15, peakGain: 0.15, filterFrequency: 300 },
  },
  armageddon: {
    tones: [
      { waveform: "sawtooth", startFrequency: 70, endFrequency: 30, delay: 0, duration: 0.8, peakGain: 0.35 },
      { waveform: "sawtooth", startFrequency: 70, endFrequency: 30, delay: 0.25, duration: 0.8, peakGain: 0.3 },
    ],
    noise: { delay: 0, duration: 0.9, peakGain: 0.35, filterFrequency: 600 },
  },
  flood: {
    tones: [{ waveform: "sine", startFrequency: 300, endFrequency: 150, delay: 0, duration: 0.7, peakGain: 0.18 }],
    noise: { delay: 0, duration: 0.8, peakGain: 0.28, filterFrequency: 1200 },
  },
};

let sharedAudioContext: AudioContext | undefined;

/**
 * Lazily creates (and resumes, if a prior context got auto-suspended) the
 * one AudioContext this whole module shares. Returns undefined wherever
 * Web Audio isn't available at all — very old browsers, primarily — so
 * callers can silently skip playback instead of throwing.
 */
function getAudioContext(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return undefined;
  if (!sharedAudioContext) sharedAudioContext = new Ctor();
  if (sharedAudioContext.state === "suspended") void sharedAudioContext.resume();
  return sharedAudioContext;
}

function playTone(ctx: AudioContext, destination: AudioNode, layer: ToneLayer, startTime: number): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = layer.waveform;
  const gain = ctx.createGain();

  const t0 = startTime + layer.delay;
  const t1 = t0 + layer.duration;
  oscillator.frequency.setValueAtTime(Math.max(1, layer.startFrequency), t0);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, layer.endFrequency), t1);

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(layer.peakGain, t0 + Math.min(0.02, layer.duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  oscillator.connect(gain).connect(destination);
  oscillator.start(t0);
  oscillator.stop(t1 + 0.02);
}

function playNoise(ctx: AudioContext, destination: AudioNode, layer: NoiseLayer, startTime: number): void {
  const t0 = startTime + layer.delay;
  const t1 = t0 + layer.duration;

  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * layer.duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = layer.filterFrequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(layer.peakGain, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  source.connect(filter).connect(gain).connect(destination);
  source.start(t0);
  source.stop(t1 + 0.02);
}

/**
 * Plays the SE for `type` — see the module doc comment and RECIPES.
 * Best-effort like main.ts's vibrate(): silently does nothing if Web Audio
 * is unavailable, and swallows any synthesis error rather than letting a
 * sound glitch break the miracle it's celebrating.
 */
export function playMiracleSound(type: MiracleSoundType): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const recipe = RECIPES[type];
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);

    const startTime = ctx.currentTime;
    for (const tone of recipe.tones) playTone(ctx, masterGain, tone, startTime);
    if (recipe.noise) playNoise(ctx, masterGain, recipe.noise, startTime);
  } catch {
    // Best-effort — see doc comment above.
  }
}
