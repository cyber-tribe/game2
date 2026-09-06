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
