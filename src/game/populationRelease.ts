import type { Entity, World } from "../ecs";
import { House, Owner, Position, Walker } from "./components";
import {
  DEFAULT_WALKER_SPEED,
  HOUSE_LEVELS,
  POPULATION_RELEASE_EFFICIENCY,
  POPULATION_RELEASE_MIN_FRACTION,
  SPROG_FRACTION,
} from "./constants";

/**
 * The original's スプログ — 「建物の中心にカーソルを合わせてBボタンを押すと、
 * 信者の一部が追い出される」 — one of the two conveniences the original is
 * praised for by name, and the one it singles out as new to this instalment:
 * 「特にスプログは前作に無かった仕様で、ゲームの進行が早くなったと好評。
 * 前作では建物の収容可能人数を超えるまで待たなければならなかった」.
 *
 * Two things in that sentence are load-bearing, and game2's previous
 * faction-wide 送出 had neither:
 *
 * - **One building.** The cursor is on a house; that house is what empties.
 *   Emptying every house a faction owns at once is a different move, and a
 *   strictly blunter one — with it on the panel, nobody would ever aim.
 * - **A part of them** (「一部が追い出される」). SPROG_FRACTION of the
 *   population walks out and the rest stays, so the house keeps growing
 *   from where it is rather than restarting from zero. That is what makes
 *   this "don't wait for capacity" rather than "cash the house in".
 *
 * Not a miracle: free, like Simulation.setBehaviorMode and moveShrine. The
 * cost is paid in the walker itself, which is weaker than the strength-1
 * one the same house would eventually produce on its own — see
 * POPULATION_RELEASE_EFFICIENCY.
 *
 * Refused below POPULATION_RELEASE_MIN_FRACTION of capacity: without a
 * floor this would shred a house's progress into an unbounded stream of
 * near-worthless walkers, each still able to found a whole new house per
 * settle.ts, far faster than createHouseGrowthSystem's capacity-gated
 * pacing allows. Refused too once the faction is at maxHousesPerFaction,
 * for the same reason createHouseGrowthSystem stops spawning there.
 *
 * Returns whether anyone actually walked out, so callers can skip feedback
 * (haptics, etc.) when nothing happened.
 */
export function sprogHouse(world: World, house: Entity, maxHousesPerFaction: number): boolean {
  const owner = world.get(house, Owner);
  const state = world.get(house, House);
  const pos = world.get(house, Position);
  if (!owner || !state || !pos) return false;

  let houseCount = 0;
  for (const entity of world.query(House, Owner)) {
    if (world.get(entity, Owner)!.faction === owner.faction) houseCount++;
  }
  if (houseCount >= maxHousesPerFaction) return false;

  const capacity = HOUSE_LEVELS[state.level].capacity;
  if (state.population / capacity < POPULATION_RELEASE_MIN_FRACTION) return false;

  const leaving = state.population * SPROG_FRACTION;

  const walker = world.createEntity();
  world.add(walker, Position, { x: pos.x, y: pos.y });
  world.add(walker, Owner, { faction: owner.faction });
  world.add(walker, Walker, {
    strength: (leaving / capacity) * POPULATION_RELEASE_EFFICIENCY,
    state: "seeking",
    speed: DEFAULT_WALKER_SPEED,
  });

  world.add(house, House, { level: state.level, population: state.population - leaving });
  return true;
}
