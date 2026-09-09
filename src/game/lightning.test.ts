import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { createHeightmap, isBuildable, isScorched, type Heightmap } from "../world/heightmap";
import { House, Owner, Position, Walker, type WalkerState } from "./components";
import { LIGHTNING_BOLTS, LIGHTNING_SCATTER } from "./constants";
import { strikeLightning } from "./lightning";

function flatHeightmap(size: number, elevation: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (const row of heightmap.vertices) row.fill(elevation);
  return heightmap;
}

function spawnWalker(world: World, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, Walker, { strength: 9, state, speed: 1 });
  return entity;
}

/** Every bolt lands exactly on the aim point. */
const dead_on = () => 0;

describe("strikeLightning", () => {
  it("throws several bolts, not one", () => {
    const world = new World();

    const bolts = strikeLightning(world, undefined, { x: 10, y: 10 });

    expect(bolts).toHaveLength(LIGHTNING_BOLTS);
  });

  /**
   * 「レベルが上がると威力ではなく命中率が向上する」 only makes sense for a
   * miracle that misses, so the scatter is the character rather than a
   * defect — see LIGHTNING_SCATTER.
   */
  it("scatters them around the aim rather than stacking them on it", () => {
    const world = new World();
    let seed = 0;
    const rng = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

    const bolts = strikeLightning(world, undefined, { x: 20, y: 20 }, rng);

    const unique = new Set(bolts.map((b) => `${b.x.toFixed(2)},${b.y.toFixed(2)}`));
    expect(unique.size).toBeGreaterThan(1);
    for (const bolt of bolts) {
      expect(Math.hypot(bolt.x - 20, bolt.y - 20)).toBeLessThanOrEqual(LIGHTNING_SCATTER + 0.001);
    }
  });

  it("kills people, burns houses and leaves the ground barren", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    spawnWalker(world, 10, 10);
    const house = world.createEntity();
    world.add(house, Position, { x: 10, y: 10 });
    world.add(house, Owner, { faction: "enemy" });
    world.add(house, House, { level: "hut", population: 0 });

    strikeLightning(world, heightmap, { x: 10, y: 10 }, dead_on);

    expect(world.query(Walker)).toHaveLength(0);
    expect(world.query(House)).toHaveLength(0);
    expect(isScorched(heightmap, 10, 10)).toBe(true);
    expect(isBuildable(heightmap, 10, 10)).toBe(false);
  });

  /**
   * アキレス is immune to *fire* — 「火が効かず焼死しない」 (#23) — and this
   * kills by the strike. So lightning is the answer to the hero who walks
   * through fire rain, which is the kind of "this one is for that one" the
   * original is built out of.
   */
  /** 雷「※オディッセウス除く」 — 気 の神技なので、気 の英雄には効かない。 */
  it("cannot touch オディッセウス", () => {
    const world = new World();
    const odysseus = spawnWalker(world, 10, 10, "odysseus");

    strikeLightning(world, undefined, { x: 10, y: 10 }, dead_on);

    expect(world.isAlive(odysseus)).toBe(true);
  });

  it("kills アキレス, who walks through fire unharmed", () => {
    const world = new World();
    const achilles = spawnWalker(world, 10, 10, "achilles");

    strikeLightning(world, undefined, { x: 10, y: 10 }, dead_on);

    expect(world.isAlive(achilles)).toBe(false);
  });

  it("leaves anything well outside the scatter alone", () => {
    const world = new World();
    const far = spawnWalker(world, 40, 40);

    strikeLightning(world, undefined, { x: 10, y: 10 });

    expect(world.isAlive(far)).toBe(true);
  });

  it("works without a heightmap — there is simply no ground to ruin", () => {
    const world = new World();
    spawnWalker(world, 10, 10);

    expect(() => strikeLightning(world, undefined, { x: 10, y: 10 }, dead_on)).not.toThrow();
    expect(world.query(Walker)).toHaveLength(0);
  });
});

/**
 * 原作「雷はボタンを押し続けている間は落ち続ける」. main.ts repeats the
 * cast on a held press, aiming every volley at the same point — which is
 * only sound because the miracle scatters its own bolts. These check the
 * property that decision rests on.
 */
describe("strikeLightning held on one spot", () => {
  const seeded = () => {
    let seed = 12345;
    return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  };

  it("lands a different volley each time, without being re-aimed", () => {
    const world = new World();
    const rng = seeded();

    const first = strikeLightning(world, undefined, { x: 20, y: 20 }, rng);
    const second = strikeLightning(world, undefined, { x: 20, y: 20 }, rng);

    const key = (bolts: { x: number; y: number }[]) => bolts.map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)}`).join("|");
    expect(key(second)).not.toBe(key(first));
  });

  it("keeps every repeat inside the same scatter, so a hold never creeps off the target", () => {
    const world = new World();
    const rng = seeded();

    for (let volley = 0; volley < 8; volley++) {
      for (const bolt of strikeLightning(world, undefined, { x: 20, y: 20 }, rng)) {
        expect(Math.hypot(bolt.x - 20, bolt.y - 20)).toBeLessThanOrEqual(LIGHTNING_SCATTER + 0.001);
      }
    }
  });

  /**
   * Held over a village, repeated volleys clear it — the reason the
   * original bothers to say the button can be held at all.
   */
  it("clears a crowd that one volley only thins", () => {
    const world = new World();
    const rng = seeded();
    // Spread around the scatter's own edge, so one volley cannot cover
    // them all — a crowd packed onto the aim point would die to a single
    // cast and prove nothing about holding.
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      spawnWalker(world, 20 + Math.cos(angle) * 2.8, 20 + Math.sin(angle) * 2.8);
    }

    strikeLightning(world, undefined, { x: 20, y: 20 }, rng);
    const afterOne = [...world.query(Walker)].length;
    for (let volley = 0; volley < 10; volley++) strikeLightning(world, undefined, { x: 20, y: 20 }, rng);
    const afterMany = [...world.query(Walker)].length;

    expect(afterOne).toBeGreaterThan(0); // one volley is not enough
    expect(afterMany).toBeLessThan(afterOne);
  });
});
