import { MIRACLE_SCHOOL, MIRACLE_SCHOOLS, miraclesOfSchool, type MiracleSchool } from "../game/miracleSchools";
import type { MiracleId } from "../game/worlds";
import type { ToolMode } from "./toolbar";

/**
 * The panel's view of the original's six schools of miracle — 「奇跡は
 * 『人・植物・地・気・火・水』の6系統に分かれる」
 * (docs/original-miracles.md).
 *
 * Not a filing convenience. game2 has all 29 of the original's miracles,
 * and by the time the last of them went in, the panel was a wall of 26
 * identically-shaped buttons in one grid — a player looking for 花 had to
 * read every one of them. The original never showed them that way: it
 * showed one school at a time, five things at most.
 *
 * The schools themselves live in game/miracleSchools.ts, because each
 * world's enemy god draws its own miracles from one of them too. This
 * module is the bridge to ui/'s ToolMode, which is the same set plus the
 * tools that are always on the panel (see ALWAYS_VISIBLE_TOOLS).
 */
export type MiracleCategory = MiracleSchool;

/** Category order and labels, as docs/original-miracles.md lists them. */
export const MIRACLE_CATEGORIES = MIRACLE_SCHOOLS;

/**
 * The tools that are *not* filed under a school, because they are always
 * on the panel: 照会 (a free inspection, not a miracle) and the terrain
 * edits.
 *
 * 隆起/沈降 are the original's own #1 土地上下 and belong to 人 by the
 * original's reckoning, but they are also the core loop this whole game
 * is built on — "平地を作る" is what a player does between every other
 * decision. Putting them a school-tap away would tax the single most
 * repeated action in the game to tidy up a panel. 平坦化 joins them for
 * the same reason (it is game2's own shortcut for the same job).
 */
export const ALWAYS_VISIBLE_TOOLS: readonly ToolMode[] = ["inspect", "raise", "lower", "flatten", "autoFlatten"];

/**
 * Which school each miracle belongs to. Identical to game/'s own map —
 * every ToolMode that isn't always visible is a MiracleId, and the
 * compiler checks that here rather than letting the two lists drift.
 */
export const MIRACLE_CATEGORY: Record<Exclude<ToolMode, (typeof ALWAYS_VISIBLE_TOOLS)[number]>, MiracleCategory> =
  MIRACLE_SCHOOL;

/** Every miracle of one school, in the order the panel lists them. */
export function miraclesInCategory(category: MiracleCategory): ToolMode[] {
  return miraclesOfSchool(category) as MiracleId[] as ToolMode[];
}
