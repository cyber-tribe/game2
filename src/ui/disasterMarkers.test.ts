import { describe, expect, it } from "vitest";
import { DISASTER_MARKER_DURATION } from "../game/constants";
import { DisasterMarkers } from "./disasterMarkers";

describe("DisasterMarkers", () => {
  it("starts empty", () => {
    expect(new DisasterMarkers().active(0)).toEqual([]);
  });

  it("remembers where a strike landed", () => {
    const markers = new DisasterMarkers();

    markers.record({ x: 12, y: 34 }, 5);

    expect(markers.active(5)).toEqual([{ x: 12, y: 34, at: 5 }]);
  });

  it("keeps several at once, oldest first", () => {
    const markers = new DisasterMarkers();
    markers.record({ x: 1, y: 1 }, 1);
    markers.record({ x: 2, y: 2 }, 2);

    expect(markers.active(2).map((mark) => mark.x)).toEqual([1, 2]);
  });

  /**
   * A permanent pin would become a map of the whole match rather than a
   * warning — the point is "go there now".
   */
  it("drops a mark once it is older than DISASTER_MARKER_DURATION", () => {
    const markers = new DisasterMarkers();
    markers.record({ x: 1, y: 1 }, 0);

    expect(markers.active(DISASTER_MARKER_DURATION - 0.01)).toHaveLength(1);
    expect(markers.active(DISASTER_MARKER_DURATION)).toHaveLength(0);
  });

  it("keeps the fresh ones when the old ones expire", () => {
    const markers = new DisasterMarkers();
    markers.record({ x: 1, y: 1 }, 0);
    markers.record({ x: 2, y: 2 }, DISASTER_MARKER_DURATION - 1);

    expect(markers.active(DISASTER_MARKER_DURATION).map((mark) => mark.x)).toEqual([2]);
  });

  /** A match that never stops casting must not grow the list without bound. */
  it("prunes on record as well as on read", () => {
    const markers = new DisasterMarkers();
    for (let i = 0; i < 100; i++) markers.record({ x: i, y: i }, i);

    expect(markers.active(99).length).toBeLessThanOrEqual(DISASTER_MARKER_DURATION);
  });

  /**
   * It is stamped against match time, which stops when the match does —
   * a paused game should not quietly clear its warnings.
   */
  it("does not expire anything while the clock stands still", () => {
    const markers = new DisasterMarkers();
    markers.record({ x: 1, y: 1 }, 30);

    expect(markers.active(30)).toHaveLength(1);
    expect(markers.active(30)).toHaveLength(1);
  });
});
