import { DEFAULT_FUNGUS_RADIUS } from "../world/heightmap";
import {
  LIGHTNING_SCATTER,
  MAX_MIRACLE_LEVEL,
  MIRACLE_LEVEL_STEP,
  MIRACLE_LEVEL_DURATION_STEP,
  MIRACLE_LEVEL_MIN_SCATTER,
} from "./constants";
import { MIRACLE_SCHOOLS, type MiracleSchool } from "./miracleSchools";

/** Experience points earned so far in each of the six schools. */
export type MiracleExperience = Record<MiracleSchool, number>;

/** A fresh god: nothing learned in any school. */
export function noExperience(): MiracleExperience {
  return { human: 0, plant: 0, earth: 0, air: 0, fire: 0, water: 0 };
}

/**
 * The original's 奇跡のレベル — 「各マップごとにスコアに応じて経験点が入り、
 * **各カテゴリーのレベル**を上げていくことができる」
 * (docs/original-miracles.md).
 *
 * Level 1 is where game2 has always been: every constant a level touches is
 * defined so that level 1 reproduces the tuned value exactly, and levels
 * above it improve on it. A player who never earns anything plays the game
 * as it was.
 */
export function levelOf(experience: MiracleExperience, school: MiracleSchool): number {
  return Math.min(MAX_MIRACLE_LEVEL, 1 + Math.floor(experience[school] / MIRACLE_LEVEL_STEP));
}

/**
 * Moves one point of a stage's earnings into a school — 原作の経験点は
 * **プレイヤーが配分する**。
 *
 * 「経験点を**地と気レベルに重点配分**して下さい」(No.22-24)、「**経験点の
 * 使い道**に迷ったら水レベルを上げると、次の太陽神の宮で役に立ちます」
 * (No.31-33)。どこへ入れるかを選ぶこと自体が原作の遊びである——次の面が
 * 何の神かを見て振り分ける。
 *
 * これは自動配分（使った系統に勝手に入る）を置き換えたものである。自動配分
 * は「各カテゴリーのレベルを上げていくことができる」という要約から game2 が
 * 作ったもので、原文に当たると player が選ぶと書いてあった（`plan/0168`）。
 *
 * A stage's pool is its 稲妻マーク count — 「**経験点10点**を取ってクリア
 * できるでしょう」(No.37-39) against 「稲妻マーク10個」 as the cap: the
 * marks *are* the points.
 */
export function allocate(experience: MiracleExperience, school: MiracleSchool, points = 1): MiracleExperience {
  return { ...experience, [school]: Math.max(0, experience[school] + points) };
}

/**
 * How far 雷's bolts scatter at this level — 「気レベルが低い段階では**命中
 * 精度が非常に低く**使い物にならないが、レベルが上がると一撃必殺の破壊力が
 * ある」.
 *
 * The one miracle whose level changes accuracy rather than duration, which
 * is the whole reason the scatter exists (see game/lightning.ts): a miracle
 * that never missed would have nothing for a level to fix.
 */
export function lightningScatterAt(level: number): number {
  const t = (clampLevel(level) - 1) / (MAX_MIRACLE_LEVEL - 1);
  return LIGHTNING_SCATTER + (MIRACLE_LEVEL_MIN_SCATTER - LIGHTNING_SCATTER) * t;
}

/**
 * How much longer an effect lasts at this level — 「地震・竜巻・嵐・火柱：
 * 効果の**持続時間**がそれぞれのレベルで伸びる」.
 *
 * One scale for all four because the source gives them one rule. Multiply
 * the miracle's own lifetime by it.
 */
export function durationScaleAt(level: number): number {
  return 1 + (clampLevel(level) - 1) * MIRACLE_LEVEL_DURATION_STEP;
}

/**
 * How wide 毒カビ is seeded at this level — 「植物のレベルが高いと一瞬かなり
 * えげつないことになる」.
 *
 * Sown wider rather than grown faster, because 毒カビ is a cellular
 * automaton whose spread depends on how many neighbours a cell has (see
 * systems/fungus.ts): a wider seeding is what turns it from a patch that
 * mostly withers into one that takes off, and 「一瞬」 is exactly that
 * difference.
 */
export function fungusRadiusAt(level: number): number {
  return DEFAULT_FUNGUS_RADIUS + Math.floor((clampLevel(level) - 1) / 2);
}

/**
 * The six schools' experience as a short string, for the campaign password
 * — game2 carries progress on paper rather than in storage (see
 * worlds.ts's nextWorldId), so the levels have to travel the same way the
 * unlock does.
 *
 * Two base-36 digits each, in MIRACLE_SCHOOLS order: fixed width, so a
 * mistyped code fails to parse rather than silently decoding as a different
 * god's progress.
 */
export function encodeExperience(experience: MiracleExperience): string {
  return MIRACLE_SCHOOLS.map(({ id }) =>
    Math.min(MAX_ENCODED_EXPERIENCE, Math.max(0, Math.floor(experience[id])))
      .toString(36)
      .padStart(2, "0"),
  ).join("");
}

/** The inverse of encodeExperience; undefined for anything that is not one of its codes. */
export function decodeExperience(code: string): MiracleExperience | undefined {
  if (code.length !== MIRACLE_SCHOOLS.length * 2) return undefined;
  const decoded = noExperience();

  for (let i = 0; i < MIRACLE_SCHOOLS.length; i++) {
    const digits = code.slice(i * 2, i * 2 + 2);
    if (!/^[0-9a-z]{2}$/.test(digits)) return undefined;
    decoded[MIRACLE_SCHOOLS[i].id] = parseInt(digits, 36);
  }

  return decoded;
}

/** The most one school can carry in a two-digit base-36 code. */
const MAX_ENCODED_EXPERIENCE = 36 * 36 - 1;

function clampLevel(level: number): number {
  return Math.min(MAX_MIRACLE_LEVEL, Math.max(1, Math.floor(level)));
}
