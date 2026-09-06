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
export type MiracleSoundType = "shrineMove" | "earthquake" | "swamp" | "holyWater" | "volcano" | "perseus" | "hercules" | "odysseus" | "achilles" | "guardian" | "armageddon" | "tsunami" | "forest" | "fireRain" | "flower" | "reef" | "road" | "fungus";

/** Every MiracleSoundType, for tests and any future UI that wants to list them. */
export const MIRACLE_SOUND_TYPES: readonly MiracleSoundType[] = [
  "shrineMove",
  "earthquake",
  "swamp",
  "holyWater",
  "volcano",
  "perseus",
  "hercules",
  "odysseus",
  "achilles",
  "guardian",
  "armageddon",
  "tsunami",
  "forest",
  "flower",
  "fireRain",
  "reef",
  "road",
  "fungus",
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
  // A clear rising chime over a soft wash — the only unambiguously *pretty*
  // sound in the set, because the spring is the only miracle that takes
  // something rather than destroying it.
  holyWater: {
    tones: [
      { waveform: "sine", startFrequency: 520, endFrequency: 780, delay: 0, duration: 0.5, peakGain: 0.16 },
      { waveform: "sine", startFrequency: 780, endFrequency: 1040, delay: 0.14, duration: 0.45, peakGain: 0.1 },
    ],
    noise: { delay: 0, duration: 0.5, peakGain: 0.06, filterFrequency: 5200 },
  },
  volcano: {
    tones: [{ waveform: "sine", startFrequency: 80, endFrequency: 35, delay: 0, duration: 0.6, peakGain: 0.3 }],
    noise: { delay: 0, duration: 0.5, peakGain: 0.3, filterFrequency: 800 },
  },
  // The four attacking heroes share one shape — two bright struck notes,
  // "a blade drawn" — and differ only in pitch and weight, because they
  // are one action heard five times a match. A player has to be able to
  // tell "the enemy promoted" from "the enemy erupted a volcano" instantly;
  // telling ヘラクレス from アキレス by ear can wait for the toast that
  // names it.
  perseus: {
    tones: [
      { waveform: "square", startFrequency: 700, endFrequency: 500, delay: 0, duration: 0.12, peakGain: 0.22 },
      { waveform: "square", startFrequency: 900, endFrequency: 600, delay: 0.08, duration: 0.1, peakGain: 0.15 },
    ],
  },
  // Lower and heavier: the strongest hero.
  hercules: {
    tones: [
      { waveform: "square", startFrequency: 420, endFrequency: 300, delay: 0, duration: 0.16, peakGain: 0.24 },
      { waveform: "square", startFrequency: 560, endFrequency: 360, delay: 0.1, duration: 0.14, peakGain: 0.18 },
    ],
  },
  // Higher and quicker: the fast one.
  odysseus: {
    tones: [
      { waveform: "square", startFrequency: 900, endFrequency: 720, delay: 0, duration: 0.08, peakGain: 0.18 },
      { waveform: "square", startFrequency: 1180, endFrequency: 880, delay: 0.06, duration: 0.07, peakGain: 0.14 },
    ],
  },
  // The same two notes with a breath of fire under them.
  achilles: {
    tones: [
      { waveform: "square", startFrequency: 700, endFrequency: 520, delay: 0, duration: 0.12, peakGain: 0.2 },
      { waveform: "square", startFrequency: 940, endFrequency: 640, delay: 0.08, duration: 0.1, peakGain: 0.15 },
    ],
    noise: { delay: 0.04, duration: 0.3, peakGain: 0.12, filterFrequency: 2600 },
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
  tsunami: {
    tones: [{ waveform: "sine", startFrequency: 300, endFrequency: 150, delay: 0, duration: 0.7, peakGain: 0.18 }],
    noise: { delay: 0, duration: 0.8, peakGain: 0.28, filterFrequency: 1200 },
  },
  // Short, hard and dry — stone breaking the surface, deliberately nothing
  // like the tsunami's long wash, since the two are used against each other.
  // Soft and rising — growth, the only constructive miracle in the set.
  forest: {
    tones: [{ waveform: "sine", startFrequency: 180, endFrequency: 420, delay: 0, duration: 0.5, peakGain: 0.14 }],
  },
  // A clean rising chime — the only miracle that repairs, and the only one
  // with no noise layer at all.
  flower: {
    tones: [
      { waveform: "sine", startFrequency: 520, endFrequency: 780, delay: 0, duration: 0.35, peakGain: 0.12 },
      { waveform: "sine", startFrequency: 780, endFrequency: 1040, delay: 0.12, duration: 0.35, peakGain: 0.09 },
    ],
  },
  // Crackle: broadband noise with no tone under it at all.
  fireRain: {
    tones: [{ waveform: "sawtooth", startFrequency: 420, endFrequency: 140, delay: 0, duration: 0.5, peakGain: 0.12 }],
    noise: { delay: 0, duration: 0.9, peakGain: 0.34, filterFrequency: 3200 },
  },
  reef: {
    tones: [{ waveform: "square", startFrequency: 160, endFrequency: 90, delay: 0, duration: 0.18, peakGain: 0.14 }],
    noise: { delay: 0, duration: 0.22, peakGain: 0.2, filterFrequency: 2200 },
  },
  // Two flat, even taps — stone laid down, nothing rising or falling. The
  // only deliberately unremarkable sound here: a road is infrastructure.
  road: {
    tones: [
      { waveform: "square", startFrequency: 240, endFrequency: 240, delay: 0, duration: 0.08, peakGain: 0.1 },
      { waveform: "square", startFrequency: 240, endFrequency: 240, delay: 0.12, duration: 0.08, peakGain: 0.1 },
    ],
  },
  // A wet, sagging note under a dull hiss — something spreading, not
  // striking. Low-passed hard so it never sounds like the fire's crackle.
  fungus: {
    tones: [{ waveform: "sine", startFrequency: 150, endFrequency: 70, delay: 0, duration: 0.7, peakGain: 0.13 }],
    noise: { delay: 0.05, duration: 0.8, peakGain: 0.14, filterFrequency: 700 },
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
