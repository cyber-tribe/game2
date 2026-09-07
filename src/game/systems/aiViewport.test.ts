import { describe, expect, it } from "vitest";
import { chooseAiViewport, isInsideViewport, isOwnFactionInViewport } from "./aiViewport";

describe("isInsideViewport", () => {
  const viewport = { centerX: 0, centerY: 0, spanAcross: 10, spanAlong: 40 };

  /**
   * The screen is a rectangle in pixels but a long thin diamond in tile
   * space — see aiViewport.ts. These two points are the same plain
   * distance from the centre and only one of them is on screen.
   */
  it("reaches far along the screen and barely at all across it", () => {
    expect(isInsideViewport({ x: 10, y: 10 }, viewport)).toBe(true); // 20 along, 0 across
    expect(isInsideViewport({ x: 10, y: -10 }, viewport)).toBe(false); // 0 along, 20 across
  });

  it("stops at each edge of the diamond", () => {
    expect(isInsideViewport({ x: 5, y: 0 }, viewport)).toBe(true);
    expect(isInsideViewport({ x: 5.1, y: 0 }, viewport)).toBe(false);
    expect(isInsideViewport({ x: 10, y: 10 }, viewport)).toBe(true);
    expect(isInsideViewport({ x: 10.1, y: 10.1 }, viewport)).toBe(false);
  });
});

describe("isOwnFactionInViewport", () => {
  it("needs only one of the faction's own inside", () => {
    const viewport = { centerX: 0, centerY: 0, spanAcross: 4, spanAlong: 4 };

    expect(isOwnFactionInViewport([{ x: 30, y: 30 }, { x: 1, y: 1 }], viewport)).toBe(true);
    expect(isOwnFactionInViewport([{ x: 30, y: 30 }], viewport)).toBe(false);
    expect(isOwnFactionInViewport([], viewport)).toBe(false);
  });
});

describe("chooseAiViewport", () => {
  it("finds a view holding both the target and one of the caster's own", () => {
    const viewport = chooseAiViewport([{ x: 0, y: 0 }], { x: 5, y: 5 }, 10, 40);

    expect(viewport).not.toBeNull();
    expect(isInsideViewport({ x: 0, y: 0 }, viewport!)).toBe(true);
    expect(isInsideViewport({ x: 5, y: 5 }, viewport!)).toBe(true);
  });

  /** Down the screen is a long way; sideways is not. Same god, same view. */
  it("reaches down the screen but not across it", () => {
    expect(chooseAiViewport([{ x: 0, y: 0 }], { x: 20, y: 20 }, 10, 40)).not.toBeNull();
    expect(chooseAiViewport([{ x: 0, y: 0 }], { x: 6, y: -6 }, 10, 40)).toBeNull();
  });

  it("refuses a target no view of that shape can reach", () => {
    expect(chooseAiViewport([{ x: 0, y: 0 }], { x: 21, y: 21 }, 10, 40)).toBeNull();
  });

  /** Whoever the god can most easily hold in one view with the target. */
  it("reaches from the nearest of the caster's own, not the first", () => {
    const own = [{ x: 0, y: 0 }, { x: 20, y: 20 }];

    expect(chooseAiViewport(own, { x: 30, y: 30 }, 10, 40)).not.toBeNull();
  });

  it("has nothing to see from when the faction has nothing left", () => {
    expect(chooseAiViewport([], { x: 1, y: 1 }, 10, 40)).toBeNull();
  });
});
