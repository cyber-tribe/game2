import type { BehaviorMode } from "../game/components";
import type { ToolMode } from "./toolbar";
import { createIconCanvas, type IconKind } from "./pixelIcons";

/** Which pixel icon (see pixelIcons.ts) each behaviorMode button gets. */
const BEHAVIOR_ICON: Record<BehaviorMode, IconKind> = {
  settle: "settle",
  gather: "gather",
  goToShrine: "goToShrine",
  fight: "fight",
};

/** Which pixel icon each ToolMode button gets — 1:1 with IconKind by name for every miracle/terrain tool. */
const TOOL_ICON: Record<ToolMode, IconKind> = {
  raise: "raise",
  lower: "lower",
  flatten: "flatten",
  shrine: "shrine",
  earthquake: "earthquake",
  swamp: "swamp",
  knight: "knight",
  guardian: "guardian",
  volcano: "volcano",
  flood: "flood",
  armageddon: "armageddon",
  inspect: "inspect",
};

/**
 * Injects a pixel-art icon into every command button in the panel (see
 * index.html's #toolbar), ahead of its existing text label — replacing the
 * OS emoji this project used to prefix labels with (🚩💥🐸⚔️🛡️🌋🌊☠️🚶), per
 * plan/0084-original-ui-foundation.md. Safe to call once at startup: the
 * icon canvases are static per button, never re-painted per frame.
 */
export function mountCommandIcons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("#toolbar [data-mode]")) {
    const mode = button.dataset.mode as BehaviorMode;
    button.prepend(createIconCanvas(BEHAVIOR_ICON[mode]));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("#toolbar [data-tool]")) {
    const tool = button.dataset.tool as ToolMode;
    button.prepend(createIconCanvas(TOOL_ICON[tool]));
  }
  const releaseButton = document.getElementById("release-population");
  releaseButton?.prepend(createIconCanvas("releasePopulation"));
}
