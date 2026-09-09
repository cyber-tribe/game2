import type { Entity, System, World } from "../../ecs";
import { Charmed, House, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { DEFAULT_WALKER_SPEED, HELEN_CAPTIVE_DRAIN_RATE, HELEN_CHARM_RADIUS, HELEN_FOLLOW_DISTANCE } from "../constants";
import type { OnImpactEffect } from "./effects";
import { distance, type Point } from "./geometry";

/**
 * Everything トロイのヘレン does.
 *
 * > トロイのヘレンは最も近い敵ウォーカー**または敵建物**を目指して勝手に
 * > 歩いていく。敵ウォーカーと接触したところで竪琴を一閃すると戦うことなく
 * > 相手を拘束出来る。また、**敵建物に接触して竪琴を一閃すると建物が消滅し、
 * > 現れたウォーカーを拘束する**。そして拘束した敵ウォーカーを引き連れて、
 * > 次の目標に向かって歩いていく。この行動を倒れるまで繰り返す。
 * > 拘束した敵ウォーカーは歩き回っているうちに**次第にパワーが減少し、
 * > 力尽きると死んでしまう**が、トロイのヘレンが先に死ぬと拘束は解ける。
 *
 * (docs/original-maps.md's source; see docs/original-miracles.md #28.)
 *
 * She is an advancing hero like ペルセウス in shape — walk to the nearest
 * enemy thing, act on it, walk to the next — and unlike every other one in
 * what the acting *is*: no fight, no fire. A walker she reaches is taken.
 * A house she reaches simply ceases to be, and the people who were inside
 * come out already hers.
 *
 * The jobs, in the order they have to happen:
 *
 * 1. **Release** anyone whose Helen is gone. Hers is the only effect in the
 *    game that is undone by its own caster dying, and doing it first means
 *    a walker freed this tick is available to be charmed by a *different*
 *    Helen in the same pass rather than sitting idle for one.
 * 2. **Drain** the captives she still holds, and let go of the ones that
 *    have nothing left. This is what bounds her: she takes prisoners far
 *    faster than she loses them, so the enemy's population drops whether
 *    or not she is ever stopped.
 * 3. **Take** whatever she is standing on — enemy walkers within
 *    HELEN_CHARM_RADIUS, and enemy houses she has reached.
 * 4. **Lead** everyone she holds along behind her, and walk her toward the
 *    nearest thing she has not taken yet.
 *
 * This used to have the *charmed* pull down their own side's houses, on a
 * reading of the catalogue article's 「敵信者を魅了して建物を更地にさせ」 —
 * see plan/0133. The walkthrough source is specific where the article is
 * compressed, and it is Helen who levels the building. The difference is
 * not cosmetic: on the old reading she had to charm someone standing next
 * to a house before anything was destroyed, so a town whose people were
 * out walking lost nobody and nothing.
 */
export interface HelenConfig {
  /** Called once per house levelled and once per captive who gives out — see systems/effects.ts. */
  onImpact: OnImpactEffect;
}

export function createHelenSystem(config: Partial<HelenConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});

  return (world, deltaSeconds) => {
    releaseAbandoned(world);
    drainCaptives(world, deltaSeconds, onImpact);

    for (const helen of world.query(Walker, Position, Owner)) {
      if (world.get(helen, Walker)!.state !== "helen") continue;

      const helenPos = world.get(helen, Position)!;
      const faction = world.get(helen, Owner)!.faction;

      charmNearbyWalkers(world, helen, helenPos, faction);
      razeReachedHouses(world, helen, helenPos, faction, onImpact);
      leadCaptives(world, helen, helenPos);

      if (world.has(helen, MoveTarget)) continue;
      const prey = nearestUntakenTarget(world, faction, helenPos);
      if (prey) world.add(helen, MoveTarget, prey);
    }
  };
}

/** 「敵ウォーカーと接触したところで竪琴を一閃すると戦うことなく相手を拘束出来る」. */
function charmNearbyWalkers(world: World, helen: Entity, helenPos: Point, faction: FactionId): void {
  for (const entity of world.query(Walker, Position, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) continue;
    if (world.has(entity, Charmed)) continue;
    if (distance(helenPos, world.get(entity, Position)!) > HELEN_CHARM_RADIUS) continue;

    world.add(entity, Charmed, { by: helen });
  }
}

/**
 * 「敵建物に接触して竪琴を一閃すると建物が消滅し、現れたウォーカーを拘束
 * する」.
 *
 * The people who were inside come out as one walker carrying that house's
 * whole population, already hers — population.ts's walkerFollowers reads a
 * walker's strength as a head count, so razing a castle hands her sixty
 * prisoners rather than one, and the faction's numbers fall by that much
 * the moment they give out. That is 「敵の人口・建築基盤を崩す」 doing both
 * halves at once, which is the point of the miracle.
 *
 * An empty house still yields one: somebody opened the door.
 */
function razeReachedHouses(
  world: World,
  helen: Entity,
  helenPos: Point,
  faction: FactionId,
  onImpact: OnImpactEffect,
): void {
  for (const house of world.query(House, Position, Owner)) {
    const houseOwner = world.get(house, Owner)!;
    if (houseOwner.faction === faction) continue;
    const housePos = world.get(house, Position)!;
    if (distance(helenPos, housePos) > HELEN_CHARM_RADIUS) continue;

    const population = world.get(house, House)!.population;

    // The people come out *before* the house comes down, and not for the
    // drama: World hands a destroyed entity's id straight back to the next
    // createEntity (see systems/effects.ts on why nothing here spawns as a
    // side effect of a destroy). Razing first would give this walker the
    // razed house's own id, and every handle anyone still held to that
    // house — a caller later in the same pass, a test — would report a live
    // building that is now a person.
    const freed = world.createEntity();
    world.add(freed, Position, { x: housePos.x, y: housePos.y });
    world.add(freed, Owner, { faction: houseOwner.faction });
    world.add(freed, Walker, { strength: Math.max(1, Math.round(population)), state: "seeking", speed: DEFAULT_WALKER_SPEED });
    world.add(freed, Charmed, { by: helen });

    onImpact({ position: housePos, type: "blown" });
    world.destroyEntity(house);
  }
}

/**
 * 「拘束した敵ウォーカーは歩き回っているうちに次第にパワーが減少し、力尽きる
 * と死んでしまう」.
 *
 * The reason she needs no cap on how many she can hold — the original says
 * plainly that she takes 「かなり多くの敵ウォーカー」, and this is what keeps
 * that from meaning "forever". game2 used to cap her at HELEN_CHARM_CAPACITY
 * instead, which bounded the miracle by an invented rule rather than by the
 * one the original actually uses.
 */
function drainCaptives(world: World, deltaSeconds: number, onImpact: OnImpactEffect): void {
  for (const entity of world.query(Charmed, Walker, Position)) {
    const walker = world.get(entity, Walker)!;
    const strength = walker.strength - HELEN_CAPTIVE_DRAIN_RATE * deltaSeconds;

    if (strength > 0) {
      world.add(entity, Walker, { ...walker, strength });
      continue;
    }

    onImpact({ position: world.get(entity, Position)!, type: "combatDeath" });
    world.destroyEntity(entity);
  }
}

/**
 * The held trail her rather than standing where they were taken — 「拘束した
 * 敵ウォーカーを引き連れて、次の目標に向かって歩いていく」. Being walked away
 * from their own settlement is half the effect; a prisoner who stayed put
 * next to their own house would cost their side nothing but themselves.
 */
function leadCaptives(world: World, helen: Entity, helenPos: Point): void {
  for (const entity of charmedBy(world, helen)) {
    if (!world.isAlive(entity)) continue;
    world.add(entity, MoveTarget, followPoint(helenPos, world.get(entity, Position)!));
  }
}

/**
 * Frees anyone whose Helen is no longer a live Helen — 「トロイのヘレンが
 * 先に死ぬと拘束は解ける」.
 *
 * The check is "still a live walker in the helen state", not merely "the
 * entity id is alive": World hands freed ids straight back out, so a dead
 * Helen's id can belong to something else entirely a tick later, and her
 * prisoners would then follow a house or a swamp around forever.
 */
function releaseAbandoned(world: World): void {
  for (const entity of world.query(Charmed)) {
    const by = world.get(entity, Charmed)!.by;
    const stillHers = world.isAlive(by) && world.has(by, Walker) && world.get(by, Walker)!.state === "helen";
    if (stillHers) continue;

    world.remove(entity, Charmed);
    // Their old orders were Helen's, not their own; dropping the target
    // hands them straight back to their own faction's systems.
    if (world.has(entity, MoveTarget)) world.remove(entity, MoveTarget);
  }
}

/** A point HELEN_FOLLOW_DISTANCE short of Helen, so the held bunch around her instead of stacking on her exact tile. */
function followPoint(helenPos: Point, from: Point): Point {
  const dx = helenPos.x - from.x;
  const dy = helenPos.y - from.y;
  const away = Math.hypot(dx, dy);
  if (away <= HELEN_FOLLOW_DISTANCE) return { x: from.x, y: from.y };
  const step = (away - HELEN_FOLLOW_DISTANCE) / away;
  return { x: from.x + dx * step, y: from.y + dy * step };
}

/**
 * 「最も近い敵ウォーカーまたは敵建物を目指して」 — houses count as targets,
 * which is what lets her work a settlement whose people are all indoors.
 * Aiming only at walkers left her standing among untouched houses with
 * nothing to walk to.
 */
function nearestUntakenTarget(world: World, faction: FactionId, from: Point): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;

  const consider = (pos: Point) => {
    const d = distance(from, pos);
    if (d >= bestDistance) return;
    bestDistance = d;
    best = { x: pos.x, y: pos.y };
  };

  for (const entity of world.query(Walker, Position, Owner)) {
    if (world.get(entity, Owner)!.faction === faction) continue;
    if (world.has(entity, Charmed)) continue;
    consider(world.get(entity, Position)!);
  }
  for (const house of world.query(House, Position, Owner)) {
    if (world.get(house, Owner)!.faction === faction) continue;
    consider(world.get(house, Position)!);
  }

  return best;
}

/** Every walker トロイのヘレン is currently holding — for tests and for the HUD. */
export function charmedBy(world: World, helen: Entity): Entity[] {
  return world.query(Charmed).filter((entity) => world.get(entity, Charmed)!.by === helen);
}
