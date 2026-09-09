import type { System, World } from "../../ecs";
import {
  applyEarthquake,
  applyFireRain,
  applyVolcano,
  DEFAULT_EARTHQUAKE_RADIUS,
  DEFAULT_VOLCANO_RADIUS,
  type Heightmap,
} from "../../world/heightmap";
import { triggerArmageddon } from "../armageddon";
import { burnFire } from "../fire";
import { createHolyWater } from "../holyWater";
import { strikeLightning } from "../lightning";
import { ENEMY_SIGNATURE_MIRACLE, type MiracleSchool } from "../miracleSchools";
import { seedPlague } from "../plague";
import { createQuake } from "../quake";
import { collapseSwampsNear, createSwamp } from "../swamp";
import { FactionState, House, Owner, Position, Walker, type FactionId } from "../components";
import {
  ARMAGEDDON_MANA_COST,
  FIRE_RAIN_MANA_COST,
  HOLY_WATER_MANA_COST,
  LIGHTNING_MANA_COST,
  PLAGUE_MANA_COST,
  SWAMP_CAPACITY,
  SWAMP_MANA_COST,
  SWAMP_RADIUS,
  ARMAGEDDON_POPULATION_RATIO,
  EARTHQUAKE_MANA_COST,
  ENEMY_PERSONALITY_TUNING,
  ENEMY_VIEWPORT_ACROSS_TILES,
  ENEMY_VIEWPORT_ALONG_TILES,
  GUARDIAN_MANA_COST,
  PERSEUS_MANA_COST,
  MIN_ARMAGEDDON_TIME,
  VOLCANO_MANA_COST,
  VOLCANO_POPULATION_RATIO,
} from "../constants";
import { findFactionEntity, trySpendMana } from "../faction";
import { promoteHero } from "../hero";
import { totalPopulation } from "../population";
import { eruptVolcano } from "../volcano";
import { ALL_MIRACLES, type EnemyPersonality, type MiracleId } from "../worlds";
import type { OnImpactEffect } from "./effects";
import { distance, type Point } from "./geometry";
import { chooseAiViewport } from "./aiViewport";

/**
 * Reported through EnemyMiracleConfig.onAction whenever the enemy
 * actually casts something (not on a decision pass that affords
 * nothing) — the game-logic side has no idea whether anyone is even
 * looking at the map right now, so it just reports what happened and
 * lets the caller (main.ts) decide how to surface it.
 */
export type EnemyMiracleEvent =
  | { type: "earthquake"; position: Point }
  | { type: "volcano"; position: Point }
  | { type: "plague"; position: Point }
  | { type: "swamp"; position: Point }
  | { type: "lightning"; position: Point }
  | { type: "fireRain"; position: Point }
  | { type: "holyWater"; position: Point }
  | { type: "perseus" }
  | { type: "guardian" }
  | { type: "armageddon" };

export interface EnemyMiracleConfig {
  factionId: FactionId;
  opponentId: FactionId;
  heightmap: Heightmap;
  worldCenter: Point;
  /** Seconds between re-evaluating whether to cast something. */
  decisionInterval: number;
  /**
   * Seconds since match start before the AI will even consider 最終決戦,
   * however lopsided the population ratio already is — see this system's
   * doc comment on why this exists.
   */
  minArmageddonTime: number;
  /** Injectable RNG, in [0, 1), for deterministic tests. */
  rng: () => number;
  /**
   * Same per-world "使用可能な奇跡の制限" the player's own toolbar is
   * gated by (see game/worlds.ts's WorldDefinition.allowedMiracles) —
   * "敵の神はプレイヤーと同じルールで介入する". Defaults to every
   * miracle unlocked, matching today's unrestricted behavior.
   */
  allowedMiracles: readonly MiracleId[];
  /**
   * The enemy god's play style (see worlds.ts's EnemyPersonality and
   * constants.ts's ENEMY_PERSONALITY_TUNING) — biases the escalation
   * thresholds and hero-kind choice below without changing which branch
   * runs or in what order. Defaults to "balanced", i.e. today's original
   * thresholds, unchanged.
   */
  personality: EnemyPersonality;
  /**
   * Whether this world's 沼 are 底なし (see game/worlds.ts's
   * WorldDefinition.bottomlessSwamp). Passed through so the enemy god's
   * own swamps match the player's on the same stage — the setting is the
   * stage's, not the caster's. Defaults to false.
   */
  bottomlessSwamp: boolean;
  /**
   * The enemy god's own view, in tiles across (x - y) and along (x + y) —
   * see aiViewport.ts and ENEMY_VIEWPORT_ACROSS_TILES. Injectable so a
   * test can shrink it instead of building a 60-tile map.
   */
  viewport: { across: number; along: number };
  /**
   * Which of the original's six schools this god draws from — see
   * miracleSchools.ts's ENEMY_SIGNATURE_MIRACLE and worlds.ts's
   * WorldDefinition.enemySchool.
   */
  school: MiracleSchool;
  /** Impact effects the cast produces, for the renderer — see systems/effects.ts. */
  onImpact: OnImpactEffect;
  /** Called once per miracle actually cast — see EnemyMiracleEvent. */
  onAction: (event: EnemyMiracleEvent) => void;
}

/**
 * Gives the enemy the same "god" toolkit the player has — not just
 * terraforming (see enemyTerraform.ts) but the miracles that actually
 * pressure the other side. Without this, only the player is a real god;
 * the enemy is just an RTS AI that happens to share the same building
 * rules. Every decisionInterval seconds, in priority order:
 *
 * 1. Population lead of ARMAGEDDON_POPULATION_RATIO or more over the
 *    opponent → go for the win with 最終決戦, per docs/game-system.md's
 *    "人口で明確に勝っているときの「決着ボタン」".
 * 2. Already aggressive (behaviorMode "fight") with a leader who isn't
 *    already the right hero kind → promote them. Behind on population
 *    (a real, measurable deficit — see preferredHeroKind below) picks
 *    guardian, so a losing enemy digs in and defends its own houses
 *    instead of marching its one hero off the map; otherwise (ahead, even,
 *    or too early to tell) picks ペルセウス, the unconditional attacker.
 * 3. A real but not-yet-decisive population lead (VOLCANO_POPULATION_
 *    RATIO or more) → escalate to a volcano, permanently denying the
 *    opponent's most valuable target rather than just disrupting it.
 * 4. Otherwise, if it can afford it, shakes up the opponent's biggest
 *    house cluster with an earthquake — economic sabotage rather than
 *    pure combat.
 *
 * `config.personality` (see EnemyPersonality) biases the thresholds in
 * steps 1-3 without changing this priority order or which branch runs —
 * an "aggressive" world's enemy commits to volcano/armageddon with a
 * smaller lead and only ever turtles behind a guardian once genuinely
 * losing; a "defensive" one holds out for a bigger lead and turtles
 * readily. "balanced" (the default) reproduces the original, unbiased
 * thresholds exactly.
 *
 * Both the earthquake and volcano targets are picked by
 * densestReachableCluster rather than uniformly at random: a real
 * opponent would aim for wherever hits the most houses, not a
 * coin-flip — and only at somewhere it can actually reach. Reach is the
 * same rule the player plays by, ported to a god with no screen: a
 * target counts only if a view the size and shape of the player's own —
 * the long thin diamond an isometric screen is in tile space — can hold
 * both it and one of this faction's own walkers, houses or its shrine
 * (see aiViewport.ts). Each branch spends mana through trySpendMana exactly like
 * a player's tap, so an enemy that can't afford a step simply falls
 * through to a cheaper one (or does nothing) rather than acting for
 * free — and a branch this world's allowedMiracles hasn't unlocked
 * falls through the exact same way, so an early world that's only
 * unlocked earthquake never sees the enemy volcano/ペルセウス/armageddon
 * it either. Skips everything once finalBattle is set, same as
 * createEnemyAiSystem.
 *
 * The 最終決戦 branch additionally waits until minArmageddonTime has
 * elapsed — see plan/archived/0045-armageddon-timing.md. Without it, a match's
 * early, noisy population swings (a house's in-progress population
 * resets to 0 every time it overflows into a walker, so totalPopulation
 * below jitters well before either side has a real economy) could clear
 * ARMAGEDDON_POPULATION_RATIO within the first minute or two, ending the
 * whole match before the earlier "繁栄"/"復興" phases had time to happen.
 */
export function createEnemyMiracleSystem(config: Partial<EnemyMiracleConfig> = {}): System {
  const factionId = config.factionId ?? "enemy";
  const opponentId = config.opponentId ?? "player";
  const heightmap = config.heightmap;
  const worldCenter = config.worldCenter;
  if (!heightmap || !worldCenter) return () => {};
  const decisionInterval = config.decisionInterval ?? 8;
  const minArmageddonTime = config.minArmageddonTime ?? MIN_ARMAGEDDON_TIME;
  const rng = config.rng ?? Math.random;
  const allowedMiracles = config.allowedMiracles ?? ALL_MIRACLES;
  const tuning = ENEMY_PERSONALITY_TUNING[config.personality ?? "balanced"];
  const viewport = config.viewport ?? { across: ENEMY_VIEWPORT_ACROSS_TILES, along: ENEMY_VIEWPORT_ALONG_TILES };
  const school = config.school ?? "earth";
  const bottomlessSwamp = config.bottomlessSwamp ?? false;
  const onImpact = config.onImpact ?? (() => {});
  const onAction = config.onAction ?? (() => {});
  let timeSincePass = decisionInterval;
  let elapsed = 0;

  return (world, deltaSeconds) => {
    elapsed += deltaSeconds;
    timeSincePass += deltaSeconds;
    if (timeSincePass < decisionInterval) return;
    timeSincePass = 0;

    const factionEntity = findFactionEntity(world, factionId);
    if (factionEntity === undefined) return;
    const state = world.get(factionEntity, FactionState)!;
    if (state.finalBattle) return;

    const myPopulation = totalPopulation(world, factionId);
    const theirPopulation = totalPopulation(world, opponentId);
    const populationRatio = theirPopulation > 0 ? myPopulation / theirPopulation : 0;

    if (
      allowedMiracles.includes("armageddon") &&
      populationRatio >= ARMAGEDDON_POPULATION_RATIO * tuning.armageddonRatioMultiplier &&
      elapsed >= minArmageddonTime
    ) {
      if (trySpendMana(world, factionId, ARMAGEDDON_MANA_COST)) {
        triggerArmageddon(world, worldCenter);
        onAction({ type: "armageddon" });
        return;
      }
    }

    if (state.behaviorMode === "fight" && state.leaderId !== undefined && world.isAlive(state.leaderId)) {
      // A real, measurable population deficit (not just "no opponent
      // population recorded yet", which populationRatio also reads as 0)
      // means the enemy is actually losing — dig in with a guardian rather
      // than sending its one hero off to hunt while its own houses burn.
      // ペルセウス, not one of the three specialists: the enemy god plays
      // by recognizable rules ("行動パターン自体は比較的予測可能"), and
      // picking ヘラクレス or アキレス well means reading the map for
      // crevices or forests — a genuinely different AI, and a difficulty
      // change, which belongs in its own measured change rather than
      // riding along with the heroes existing at all.
      const preferredHeroKind = theirPopulation > 0 && populationRatio < 1 + tuning.heroPreferenceBias ? "guardian" : "perseus";
      const heroCost = preferredHeroKind === "guardian" ? GUARDIAN_MANA_COST : PERSEUS_MANA_COST;
      const leader = world.get(state.leaderId, Walker);

      if (allowedMiracles.includes(preferredHeroKind) && leader && leader.state !== preferredHeroKind && trySpendMana(world, factionId, heroCost)) {
        promoteHero(world, factionId, preferredHeroKind);
        onAction({ type: preferredHeroKind });
        return;
      }
    }

    if (allowedMiracles.includes("volcano") && populationRatio >= VOLCANO_POPULATION_RATIO * tuning.volcanoRatioMultiplier) {
      const target = densestReachableCluster(world, factionId, opponentId, DEFAULT_VOLCANO_RADIUS, viewport, rng);
      if (target && trySpendMana(world, factionId, VOLCANO_MANA_COST)) {
        eruptVolcano(world, applyVolcano(heightmap, target.x, target.y, undefined, undefined, undefined, undefined, rng), target, rng);
        onAction({ type: "volcano", position: target });
        return;
      }
    }

    // The god's own school — see miracleSchools.ts's
    // ENEMY_SIGNATURE_MIRACLE. 地震 is 地's own signature, so an earth god
    // simply falls through to the branch below.
    const signature = ENEMY_SIGNATURE_MIRACLE[school];
    if (signature !== "earthquake" && allowedMiracles.includes(signature)) {
      const signatureTarget = densestReachableCluster(world, factionId, opponentId, DEFAULT_EARTHQUAKE_RADIUS, viewport, rng);
      if (signatureTarget && castSignature(world, heightmap, factionId, signature, signatureTarget, rng, onImpact, bottomlessSwamp)) {
        onAction({ type: signature as EnemyMiracleEvent["type"], position: signatureTarget });
      }
      // Saves up for its own miracle rather than spending the difference
      // on 地震: a 水 god that casts two earthquakes for every spring is
      // not a 水 god, it is an earth god with a hobby. A pass it cannot
      // afford is a pass it does nothing on — which is also what makes
      // the pricier schools cast in bursts instead of on a metronome.
      return;
    }

    if (!allowedMiracles.includes("earthquake")) return;
    const target = densestReachableCluster(world, factionId, opponentId, DEFAULT_EARTHQUAKE_RADIUS, viewport, rng);
    if (target && trySpendMana(world, factionId, EARTHQUAKE_MANA_COST)) {
      // Same aiming rule the player gets (see main.ts): away from its own
      // shrine, through the target.
      const shrineEntity = findFactionEntity(world, factionId);
      const from = shrineEntity === undefined ? target : world.get(shrineEntity, FactionState)!.shrinePosition;
      const fissure = applyEarthquake(heightmap, target.x, target.y, target.x - from.x, target.y - from.y, undefined, rng);
      // The god's quake denies the player's spade exactly as the player's
      // own does — 「地震が続いている間は修復が出来ない」 — and this is the
      // side of it that bites: an enemy 地震 the defender could fill back in
      // on the next tap was never a threat. See game/quake.ts.
      createQuake(world, fissure);
      collapseSwampsNear(world, target.x, target.y, DEFAULT_EARTHQUAKE_RADIUS);
      onAction({ type: "earthquake", position: target });
    }
  };
}

/**
 * Casts one school's signature miracle at `target`, spending the mana for
 * it. Returns false without spending anything when the faction can't
 * afford it, or — for 病原菌, which needs someone to infect — when the
 * cast would do nothing at all; the caller then falls through to a
 * cheaper miracle, exactly as the player's own tap does (see main.ts).
 *
 * 地震 is deliberately absent: it is 地's signature and the fallback every
 * god shares, so it stays in the system's own last branch rather than
 * being reachable from two places.
 */
function castSignature(
  world: World,
  heightmap: Heightmap,
  factionId: FactionId,
  signature: MiracleId,
  target: Point,
  rng: () => number,
  onImpact: OnImpactEffect,
  bottomlessSwamp: boolean,
): boolean {
  switch (signature) {
    case "plague":
      // Checked before charging, like the player's own cast: a plague on
      // empty ground is a cast that does nothing.
      if (totalMana(world, factionId) < PLAGUE_MANA_COST) return false;
      if (seedPlague(world, target) === 0) return false;
      return trySpendMana(world, factionId, PLAGUE_MANA_COST);
    case "swamp":
      if (!trySpendMana(world, factionId, SWAMP_MANA_COST)) return false;
      createSwamp(world, target.x, target.y, SWAMP_RADIUS, SWAMP_CAPACITY, bottomlessSwamp);
      return true;
    case "lightning":
      if (!trySpendMana(world, factionId, LIGHTNING_MANA_COST)) return false;
      strikeLightning(world, heightmap, target, rng, onImpact);
      return true;
    case "fireRain":
      if (!trySpendMana(world, factionId, FIRE_RAIN_MANA_COST)) return false;
      burnFire(world, applyFireRain(heightmap, target.x, target.y), onImpact);
      return true;
    case "holyWater":
      // The spring belongs to whoever cast it, so this one takes the
      // opponent's people rather than killing them (see systems/holyWater.ts).
      if (!trySpendMana(world, factionId, HOLY_WATER_MANA_COST)) return false;
      createHolyWater(world, factionId, target.x, target.y);
      return true;
    default:
      return false;
  }
}

/** A faction's current mana, for the one cast that has to look before it acts. */
function totalMana(world: World, factionId: FactionId): number {
  const factionEntity = findFactionEntity(world, factionId);
  return factionEntity === undefined ? 0 : world.get(factionEntity, FactionState)!.mana;
}

/**
 * Every position the casting faction can claim to be present at — its
 * walkers, its houses and its shrine, exactly the three things main.ts
 * looks for when deciding whether the *player* may cast (see
 * isOwnFactionVisible).
 */
function ownPresence(world: World, factionId: FactionId): Point[] {
  const positions: Point[] = [];
  for (const entity of world.query(Position, Owner)) {
    if (world.get(entity, Owner)!.faction !== factionId) continue;
    if (!world.has(entity, Walker) && !world.has(entity, House)) continue;
    positions.push(world.get(entity, Position)!);
  }
  const factionEntity = findFactionEntity(world, factionId);
  if (factionEntity !== undefined) positions.push(world.get(factionEntity, FactionState)!.shrinePosition);
  return positions;
}

/**
 * Picks the opponent house surrounded by the most other opponent houses
 * within `radius` — the settlement an earthquake/volcano would actually
 * hit hardest — **out of those the casting god can reach at all**: a
 * target counts only if one view can hold both it and one of the god's
 * own (see aiViewport.ts). A denser settlement on
 * the far side of the map is not a target, it is somewhere to march to
 * first.
 *
 * Ties (including the common case of every house being equally isolated)
 * are broken by rng so a single house still gets picked deterministically
 * under a fixed rng in tests.
 */
function densestReachableCluster(
  world: World,
  factionId: FactionId,
  opponentId: FactionId,
  radius: number,
  viewport: { across: number; along: number },
  rng: () => number,
): Point | null {
  const positions: Point[] = [];
  for (const entity of world.query(House, Position, Owner)) {
    if (world.get(entity, Owner)!.faction === opponentId) positions.push(world.get(entity, Position)!);
  }
  if (positions.length === 0) return null;

  const own = ownPresence(world, factionId);
  // Scored against every opponent house, reachable or not: how valuable a
  // settlement is doesn't depend on where the attacker happens to stand.
  // Only the choice of where to actually strike is limited.
  const scores = positions.map((position) => positions.filter((other) => distance(position, other) <= radius).length);
  const reachable = positions
    .map((position, index) => ({ position, score: scores[index] }))
    .filter(({ position }) => chooseAiViewport(own, position, viewport.across, viewport.along) !== null);
  if (reachable.length === 0) return null;

  const bestScore = Math.max(...reachable.map(({ score }) => score));
  const contenders = reachable.filter(({ score }) => score === bestScore);
  return contenders[Math.floor(rng() * contenders.length)].position;
}
