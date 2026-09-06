import { describe, expect, it } from "vitest";
import type { FactionId } from "../game/components";
import {
  ATLAS_FRAME_KEYS,
  WALK_FRAMES,
  walkerFrameKey,
  walkerPose,
  type Facing,
  type HeroKind,
  type WalkerPose,
} from "./walkerSprites";

const FACTIONS: FactionId[] = ["player", "enemy"];
const FACINGS: Facing[] = ["NE", "NW", "SE", "SW"];
const POSES: WalkerPose[] = ["plain", "leader", "knight", "guardian", "leaderKnight", "leaderGuardian"];
const FRAMES = Array.from({ length: WALK_FRAMES }, (_, i) => i);

describe("walkerPose", () => {
  it("maps a plain walker and a plain leader", () => {
    expect(walkerPose(false)).toBe("plain");
    expect(walkerPose(true)).toBe("leader");
  });

  it("maps each hero kind", () => {
    expect(walkerPose(false, "knight")).toBe("knight");
    expect(walkerPose(false, "guardian")).toBe("guardian");
  });

  it("keeps leader and hero independent — a promoted leader gets both marks", () => {
    expect(walkerPose(true, "knight")).toBe("leaderKnight");
    expect(walkerPose(true, "guardian")).toBe("leaderGuardian");
  });

  it("covers every pose the atlas carries, with nothing left over", () => {
    const reachable = new Set<WalkerPose>();
    for (const isLeader of [false, true]) {
      for (const hero of [undefined, "knight", "guardian"] as (HeroKind | undefined)[]) {
        reachable.add(walkerPose(isLeader, hero));
      }
    }

    expect([...reachable].sort()).toEqual([...POSES].sort());
  });
});

describe("walkerFrameKey", () => {
  /**
   * The real point of this file. walkerFrameKey and frame_key() in
   * tools/sprites/walkers.py build the same string independently, in two
   * languages — and a disagreement wouldn't throw, it would just make the
   * texture lookup return undefined and the walker silently vanish. So
   * check every key the game can ask for against the committed atlas.
   */
  it("produces only keys the committed atlas actually contains", () => {
    const atlas = new Set(ATLAS_FRAME_KEYS);
    const asked: string[] = [];

    for (const faction of FACTIONS) {
      for (const pose of POSES) {
        for (const facing of FACINGS) {
          for (const frame of FRAMES) {
            asked.push(walkerFrameKey(faction, pose, facing, frame));
          }
        }
      }
    }

    expect(asked.filter((key) => !atlas.has(key))).toEqual([]);
  });

  it("uses every frame the atlas ships — no dead art", () => {
    const asked = new Set(
      FACTIONS.flatMap((faction) =>
        POSES.flatMap((pose) =>
          FACINGS.flatMap((facing) => FRAMES.map((frame) => walkerFrameKey(faction, pose, facing, frame))),
        ),
      ),
    );

    expect(ATLAS_FRAME_KEYS.filter((key) => !asked.has(key))).toEqual([]);
  });

  it("gives every walk-cycle frame its own key", () => {
    const keys = new Set(FRAMES.map((frame) => walkerFrameKey("player", "plain", "SE", frame)));
    expect(keys.size).toBe(WALK_FRAMES);
  });
});
