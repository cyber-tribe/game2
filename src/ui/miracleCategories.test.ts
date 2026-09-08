import { describe, expect, it } from "vitest";
// The panel's own markup, read through vite rather than the filesystem so
// this test needs no node typings — see the describe block below.
import html from "../../index.html?raw";
import {
  ALWAYS_VISIBLE_TOOLS,
  MIRACLE_CATEGORIES,
  MIRACLE_CATEGORY,
  miraclesInCategory,
  type MiracleCategory,
} from "./miracleCategories";

/**
 * The six schools as docs/original-miracles.md counts them, minus what
 * game2 keeps out of the panel's schools: 土地上下 (人) are the terrain
 * edits, always visible rather than filed under a school. 渦巻き now has a
 * button of its own like every other miracle in the original's list, so 水
 * is back to five.
 */
const ORIGINAL_SIZES: Record<MiracleCategory, number> = {
  human: 5, // 集結地移動, ペルセウス, 病原菌, 最終決戦 + game2's 守護者化
  plant: 5,
  earth: 5,
  air: 5,
  fire: 4,
  water: 5, // 岩礁, 渦巻き, 聖水の泉, トロイのヘレン, 津波
};

describe("MIRACLE_CATEGORY", () => {
  it("puts every miracle in exactly one school", () => {
    const filed = Object.keys(MIRACLE_CATEGORY);

    expect(new Set(filed).size).toBe(filed.length);
    expect(filed.some((tool) => (ALWAYS_VISIBLE_TOOLS as readonly string[]).includes(tool))).toBe(false);
  });

  it("keeps the schools the size the original's own tables are", () => {
    for (const { id } of MIRACLE_CATEGORIES) {
      expect({ id, size: miraclesInCategory(id).length }).toEqual({ id, size: ORIGINAL_SIZES[id] });
    }
  });

  /**
   * One hero per school is the original's own pattern, and most of why
   * these groupings are worth having rather than any six buckets of five.
   */
  it("gives each school its own hero", () => {
    const heroes: Record<string, MiracleCategory> = {
      perseus: "human",
      adonis: "plant",
      hercules: "earth",
      odysseus: "air",
      achilles: "fire",
      helen: "water",
    };

    for (const [hero, category] of Object.entries(heroes)) {
      expect({ hero, category: MIRACLE_CATEGORY[hero as keyof typeof MIRACLE_CATEGORY] }).toEqual({ hero, category });
    }
  });

  it("lists all six schools in the original's order", () => {
    expect(MIRACLE_CATEGORIES.map(({ id }) => id)).toEqual(["human", "plant", "earth", "air", "fire", "water"]);
  });
});

/**
 * The panel's markup is hand-written HTML (index.html) while the schools
 * are declared in TypeScript, so nothing but this test stops the two
 * drifting: a miracle filed under 気 but printed in the 火 row, or a new
 * miracle with a button and no school (or a school and no button). Both
 * are silent — the button just sits in the wrong place, or nowhere.
 */
describe("index.html's own panel", () => {
  const groups = [...html.matchAll(/<div class="command-row miracle-group" data-category="(\w+)"[^>]*>([\s\S]*?)<\/div>/g)];

  it("prints each school's buttons in that school's own row", () => {
    const printed = Object.fromEntries(
      groups.map(([, category, body]) => [category, [...body.matchAll(/data-tool="(\w+)"/g)].map(([, tool]) => tool)]),
    );

    for (const { id } of MIRACLE_CATEGORIES) {
      expect({ id, tools: printed[id] }).toEqual({ id, tools: miraclesInCategory(id) });
    }
  });

  it("shows exactly one school at a time, 人 to begin with", () => {
    const visible = groups.filter(([tag]) => !tag.includes(" hidden")).map(([, category]) => category);

    expect(visible).toEqual(["human"]);
  });

  it("keeps the always-visible tools out of the schools", () => {
    const inGroups = groups.flatMap(([, , body]) => [...body.matchAll(/data-tool="(\w+)"/g)].map(([, tool]) => tool));

    for (const tool of ALWAYS_VISIBLE_TOOLS) expect(inGroups).not.toContain(tool);
    for (const tool of ALWAYS_VISIBLE_TOOLS) expect(html).toContain(`data-tool="${tool}"`);
  });
});
