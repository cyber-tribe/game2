import type { BehaviorMode } from "../game/components";

export type ToolMode = "raise" | "lower" | "earthquake" | "swamp" | "volcano" | "flood";

export interface ToolbarCallbacks {
  onBehaviorMode: (mode: BehaviorMode) => void;
  onToolMode: (mode: ToolMode) => void;
}

/**
 * Wires the static button markup in index.html's #toolbar to the given
 * callbacks. Phones have no keyboard or right-click, so every player
 * action (behaviorMode, which miracle a tap casts) is a tap target here
 * instead — see docs/tech-stack.md's "縦持ちスマホPWA".
 */
export function wireToolbar(callbacks: ToolbarCallbacks): void {
  wireGroup<BehaviorMode>("[data-mode]", "mode", callbacks.onBehaviorMode);
  wireGroup<ToolMode>("[data-tool]", "tool", callbacks.onToolMode);
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
