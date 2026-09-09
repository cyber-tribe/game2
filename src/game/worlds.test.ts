import { describe, expect, it } from "vitest";
import { MIRACLE_SCHOOLS } from "./miracleSchools";
import { ALL_MIRACLES, GODS, STAGES_PER_GOD, WORLDS, nextWorldId, unlockedCountForPassword, type EnemyPersonality } from "./worlds";

const KNOWN_PERSONALITIES: readonly EnemyPersonality[] = ["balanced", "aggressive", "defensive"];

describe("WORLDS", () => {
  it("has at least one selectable world", () => {
    expect(WORLDS.length).toBeGreaterThan(0);
  });

  /**
   * 「敵として16人の神が登場し、各3ステージが用意されている」 — and the
   * resulting 全48面 is a number the original itself calls out (as a
   * 賛否両論点: 「ステージ数が全48面と少ない」). game2 shipped 6.
   */
  it("runs the original's 16 gods of 3 stages each — 全48面", () => {
    expect(GODS).toHaveLength(16);
    expect(STAGES_PER_GOD).toBe(3);
    expect(WORLDS).toHaveLength(48);
  });

  /**
   * The opponent is the same across a god's three stages; the *stage* is
   * not. game2 used to hand one toolset per god and keep it for all three;
   * the original re-deals every time, and often differs within a god
   * (アルゴス goes 5 → 7 → 9 miracles, アテナイ 17 → 9 → 12).
   */
  it("keeps a god's three stages the same opponent, and lets the stage itself differ", () => {
    for (let i = 0; i < GODS.length; i++) {
      const stages = WORLDS.slice(i * STAGES_PER_GOD, (i + 1) * STAGES_PER_GOD);
      expect(stages).toHaveLength(STAGES_PER_GOD);
      for (const stage of stages) {
        expect(stage.enemySchool).toBe(stages[0].enemySchool);
        expect(stage.enemyPersonality).toBe(stages[0].enemyPersonality);
        expect(stage.terrain).toBe(stages[0].terrain);
      }
    }
  });

  it("deals a different hand within at least one god's three stages", () => {
    const differs = GODS.some((_, i) => {
      const [first, second, third] = WORLDS.slice(i * STAGES_PER_GOD, (i + 1) * STAGES_PER_GOD);
      return (
        first.allowedMiracles.length !== second.allowedMiracles.length ||
        second.allowedMiracles.length !== third.allowedMiracles.length
      );
    });

    expect(differs).toBe(true);
  });

  /**
   * `enemySchool` is the god's own mythological domain — what the world
   * select calls it — and deliberately *not* an invariant about what that
   * stage allows. Six of the forty-eight allow nothing from their god's
   * school at all, so tying the two together would mean rewriting the
   * original's table. enemyMiracles.ts already falls back when its
   * signature is not dealt.
   */
  it("gives every god one of the six schools, the same across its three stages", () => {
    for (let i = 0; i < GODS.length; i++) {
      const stages = WORLDS.slice(i * STAGES_PER_GOD, (i + 1) * STAGES_PER_GOD);
      for (const stage of stages) {
        expect(MIRACLE_SCHOOLS.map(({ id }) => id)).toContain(stage.enemySchool);
        expect(stage.enemySchool).toBe(stages[0].enemySchool);
      }
    }
  });

  /**
   * The hand is dealt per stage, not accumulated — 「面ごとに配り直す」. So
   * the invariant is not "unlocked exactly once" (the old cumulative model)
   * but "every miracle is dealt somewhere", which is what makes all 29 of
   * them reachable across a playthrough.
   */
  it("deals every miracle on some stage", () => {
    const dealt = new Set(WORLDS.flatMap((world) => world.allowedMiracles));

    expect(dealt).toEqual(new Set(ALL_MIRACLES));
  });

  /**
   * And it genuinely shrinks as well as grows, which is the whole reason
   * the table is transcribed rather than generated: No.4 takes ペルセウス,
   * 沼, 火柱 and 雷 away at once, No.29 drops fourteen.
   */
  it("takes miracles away again, not only adds them", () => {
    const shrinks = WORLDS.some((world, i) => {
      if (i === 0) return false;
      return WORLDS[i - 1].allowedMiracles.some((miracle) => !world.allowedMiracles.includes(miracle));
    });

    expect(shrinks).toBe(true);
  });

  it("gives every world a unique id", () => {
    const ids = WORLDS.map((world) => world.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every world the same fixed 64x64 map size (see plan/0062-original-scale-map.md)", () => {
    for (const world of WORLDS) {
      expect(world.worldWidth).toBe(64);
      expect(world.worldHeight).toBe(64);
    }
  });

  it("never eases the enemy AI's speed or aggression as the list goes on", () => {
    for (let i = 1; i < WORLDS.length; i++) {
      expect(WORLDS[i].enemyDecisionInterval).toBeLessThanOrEqual(WORLDS[i - 1].enemyDecisionInterval);
      expect(WORLDS[i].enemyAggressionThreshold).toBeLessThanOrEqual(WORLDS[i - 1].enemyAggressionThreshold);
    }
  });

  it("keeps enemyDecisionInterval and enemyAggressionThreshold positive", () => {
    for (const world of WORLDS) {
      expect(world.enemyDecisionInterval).toBeGreaterThan(0);
      expect(world.enemyAggressionThreshold).toBeGreaterThan(0);
    }
  });

  /**
   * Superseded: the original's hand shrinks as well as grows (see "takes
   * miracles away again" above). What is still worth holding is that the
   * *size* moves — a table that dealt the same count every stage would
   * mean the transcription had flattened something.
   */
  it("varies how much it deals from stage to stage", () => {
    const counts = WORLDS.map((world) => world.allowedMiracles.length);
    expect(new Set(counts).size).toBeGreaterThan(4);
  });
  it("unlocks strictly more miracles at some point across the list, not the same set throughout", () => {
    const counts = WORLDS.map((world) => world.allowedMiracles.length);
    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts));
  });

  /**
   * Not "the last stage has everything" — the original's last stage is
   * missing 集結地移動, among others. What matters is that no miracle is
   * unreachable, which "deals every miracle on some stage" above covers.
   * Here: the last stage is a real hand, not an empty or total one.
   */
  it("ends on a hand that is neither empty nor everything", () => {
    const last = WORLDS[WORLDS.length - 1].allowedMiracles;

    expect(last.length).toBeGreaterThan(0);
    expect(last.length).toBeLessThan(ALL_MIRACLES.length);
  });
  it("never lists a miracle outside the known set", () => {
    for (const world of WORLDS) {
      for (const miracle of world.allowedMiracles) {
        expect(ALL_MIRACLES).toContain(miracle);
      }
    }
  });

  it("gives every world a known EnemyPersonality", () => {
    // Deliberately not asserted monotonic like the difficulty axes above —
    // see EnemyPersonality's own doc comment: it's meant to feel like a
    // different opponent per world, not a strictly harsher one.
    for (const world of WORLDS) {
      expect(KNOWN_PERSONALITIES).toContain(world.enemyPersonality);
    }
  });

  it("gives at least one world a personality other than balanced", () => {
    expect(WORLDS.some((world) => world.enemyPersonality !== "balanced")).toBe(true);
  });

  /**
   * Not monotonic. game2 used to ratchet this one way; the original turns
   * 敵陣での↑↓ off and on again across the campaign (月神の宮 goes
   * ○ → × → ○), because it is a property of the map rather than a rung on
   * a difficulty ladder. What is worth asserting is that it is used at all,
   * in both directions.
   */
  it("turns 敵陣での土地上下 off on some stages and back on later", () => {
    const flags = WORLDS.map((world) => world.enemyTerritoryEditable);

    expect(flags).toContain(true);
    expect(flags).toContain(false);
    expect(flags.some((editable, i) => i > 0 && editable && !flags[i - 1])).toBe(true);
  });
  it("restricts enemyTerritoryEditable somewhere in the list, not every world staying editable", () => {
    expect(WORLDS.some((world) => !world.enemyTerritoryEditable)).toBe(true);
  });

  it("only sets instantDrowning on rock (溶岩地帯) terrain — not a monotonic difficulty axis, tied to the terrain's own lava theming", () => {
    for (const world of WORLDS) {
      expect(world.instantDrowning).toBe(world.terrain === "rock");
    }
  });

  it("gives at least one world instantDrowning", () => {
    expect(WORLDS.some((world) => world.instantDrowning)).toBe(true);
  });
});

describe("nextWorldId", () => {
  it("returns the following world's id for a world in the middle of the list", () => {
    expect(nextWorldId(WORLDS[0].id)).toBe(WORLDS[1].id);
  });

  it("returns undefined once the last world in the list is cleared", () => {
    expect(nextWorldId(WORLDS[WORLDS.length - 1].id)).toBeUndefined();
  });

  it("returns undefined for an id that isn't in WORLDS at all", () => {
    expect(nextWorldId("not-a-real-world")).toBeUndefined();
  });
});

describe("unlockedCountForPassword", () => {
  it("unlocks through the matched world, one past its own index", () => {
    expect(unlockedCountForPassword(WORLDS[2].id)).toBe(3);
  });

  it("unlocking with the very first world's id still only unlocks that one world", () => {
    expect(unlockedCountForPassword(WORLDS[0].id)).toBe(1);
  });

  it("unlocking with the password nextWorldId hands out also covers the world just cleared", () => {
    const clearedIndex = 1;
    const password = nextWorldId(WORLDS[clearedIndex].id)!;

    expect(unlockedCountForPassword(password)).toBe(clearedIndex + 2);
  });

  it("returns undefined for an unrecognized password", () => {
    expect(unlockedCountForPassword("not-a-real-password")).toBeUndefined();
  });
});

/**
 * 原作の3種の制限面 —— 「土地上げ不可ステージ」「土地下げ不可ステージ」
 * 「土地上下不可ステージ」. game2 had the first two and no third; the
 * campaign should be able to deal all three.
 */
describe("terrainEditRule across the campaign", () => {
  it("uses every one of the original's restricted stage kinds", () => {
    const rules = new Set(WORLDS.map((world) => world.terrainEditRule));

    expect(rules).toEqual(new Set(["both", "raiseOnly", "lowerOnly", "neither"]));
  });

  /**
   * 土地上下不可 is where the source says 「よって神業で敵の住める土地を
   * ゼロにすることになる」, so such a stage has to deal miracles that can
   * actually take land away — 渦巻き, 津波 or 火山.
   */
  it("gives every 土地上下不可 stage a way to take land away", () => {
    const noTerraform = WORLDS.filter((world) => world.terrainEditRule === "neither");

    expect(noTerraform.length).toBeGreaterThan(0);
    for (const world of noTerraform) {
      expect(world.allowedMiracles.some((m) => m === "whirlpool" || m === "tsunami" || m === "volcano")).toBe(true);
    }
  });
});

/**
 * The two per-stage settings that gate operations rather than miracles —
 * see docs/original-maps.md's ○× table.
 */
describe("面ごとに落とされる操作", () => {
  it("opens terraforming on exactly the five stages the source names", () => {
    const open = WORLDS.map((world, i) => (world.openTerraforming ? i + 1 : 0)).filter(Boolean);

    expect(open).toEqual([1, 2, 3, 4, 19]);
  });

  it("takes スプログ away on ゼウス's three stages and nowhere else", () => {
    const denied = WORLDS.map((world, i) => (world.sprogAllowed ? 0 : i + 1)).filter(Boolean);

    expect(denied).toEqual([46, 47, 48]);
    for (const stage of denied) expect(WORLDS[stage - 1].god).toBe("ゼウス");
  });

  /**
   * 「溺れた人間の救出」 — × on all fifteen of the first stages and then
   * largely ○ from No.16 on, with two later exceptions. The shape matters:
   * the operation arrives mid-campaign rather than being there from the
   * start, and can still be taken away again afterwards.
   */
  it("withholds 救出 on exactly the seventeen stages the source names", () => {
    const denied = WORLDS.map((world, i) => (world.rescueAllowed ? 0 : i + 1)).filter(Boolean);

    expect(denied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 26, 39]);
  });

  /**
   * 「敵の位置表示」「災害箇所表示」 — the two settings that take away
   * information rather than an operation. 「表示を奪うことが難易度の軸に
   * なっている」.
   */
  it("hides the enemy on exactly the eleven stages the source names", () => {
    const hidden = WORLDS.map((world, i) => (world.enemyPositionsVisible ? 0 : i + 1)).filter(Boolean);

    expect(hidden).toEqual([16, 18, 19, 25, 26, 40, 41, 42, 43, 45, 48]);
  });

  it("hides 災害箇所 on exactly the six stages the source names", () => {
    const hidden = WORLDS.map((world, i) => (world.disasterMarkersVisible ? 0 : i + 1)).filter(Boolean);

    expect(hidden).toEqual([25, 40, 41, 42, 45, 48]);
  });

  /**
   * Every stage that hides the strikes also hides the enemy — the two are
   * dealt as a pair at the hard end, never the other way round.
   */
  it("never hides 災害箇所 on a stage that still shows the enemy", () => {
    for (const world of WORLDS) {
      if (!world.disasterMarkersVisible) expect(world.enemyPositionsVisible).toBe(false);
    }
  });

  it("keeps 底なし沼 off on exactly the five stages the source names", () => {
    const fillable = WORLDS.map((world, i) => (world.bottomlessSwamp ? 0 : i + 1)).filter(Boolean);

    expect(fillable).toEqual([7, 8, 9, 35, 36]);
  });
});

