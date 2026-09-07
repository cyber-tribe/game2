import type { BehaviorMode } from "../game/components";

export type ToolMode =
  | "raise"
  | "lower"
  | "flatten"
  | "autoFlatten"
  | "shrine"
  | "earthquake"
  | "swamp"
  | "holyWater"
  | "tornado"
  | "firePillar"
  | "lightning"
  | "storm"
  | "plague"
  | "hurricane"
  | "perseus"
  | "hercules"
  | "odysseus"
  | "achilles"
  | "adonis"
  | "helen"
  | "guardian"
  | "volcano"
  | "forest"
  | "flower"
  | "fireRain"
  | "tsunami"
  | "reef"
  | "road"
  | "wall"
  | "megalith"
  | "fungus"
  | "armageddon"
  | "inspect";

import type { MiracleCategory } from "./miracleCategories";

export interface ToolbarCallbacks {
  onBehaviorMode: (mode: BehaviorMode) => void;
  onToolMode: (mode: ToolMode) => void;
}

/**
 * Wires the static button markup in index.html's #toolbar to the given
 * callbacks. Phones have no keyboard or right-click, so every player
 * action (behaviorMode, which miracle a tap casts) is a tap target here
 * instead — see plan/archived/0008-portrait-smartphone-pwa.md.
 */
export function wireToolbar(callbacks: ToolbarCallbacks): void {
  wireGroup<BehaviorMode>("[data-mode]", "mode", callbacks.onBehaviorMode);
  wireGroup<ToolMode>("[data-tool]", "tool", callbacks.onToolMode);
  wireMiracleCategories(callbacks.onToolMode);
}

/**
 * Shows one school of miracle at a time — see miracleCategories.ts for why
 * the panel is organised this way at all.
 *
 * Every school's buttons stay in the DOM whichever one is showing, hidden
 * rather than removed: main.ts finds them by `#toolbar [data-tool="…"]` to
 * disable what this world hasn't unlocked and to dim what the player
 * can't currently afford, and neither of those should have to know which
 * school happens to be open.
 */
function wireMiracleCategories(onToolMode: (mode: ToolMode) => void): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>("#toolbar .category-button");
  const groups = document.querySelectorAll<HTMLElement>("#toolbar .miracle-group");
  const tools = document.querySelectorAll<HTMLButtonElement>("#toolbar [data-tool]");

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const category = tab.dataset.category as MiracleCategory;
      for (const other of tabs) other.setAttribute("aria-pressed", String(other === tab));
      for (const group of groups) group.hidden = group.dataset.category !== category;

      // Changing school disarms whatever was selected, back to 照会.
      // Otherwise a 竜巻 armed in 気 stays armed while the player is
      // reading through 火, and the next tap on the map spends 22 mana on
      // a miracle they had stopped thinking about — the one selection in
      // this panel they can no longer see.
      for (const tool of tools) tool.setAttribute("aria-pressed", String(tool.dataset.tool === "inspect"));
      onToolMode("inspect");
    });
  }
}

function wireGroup<T extends string>(selector: string, dataKey: "mode" | "tool", onSelect: (value: T) => void): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(`#toolbar ${selector}`);

  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
      onSelect(button.dataset[dataKey] as T);
    });
  }
}
