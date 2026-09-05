import type { System, World } from "../../ecs";
import {
  applyEarthquake,
  applyVolcano,
  DEFAULT_EARTHQUAKE_RADIUS,
  DEFAULT_VOLCANO_RADIUS,
  type Heightmap,
} from "../../world/heightmap";
import { triggerArmageddon } from "../armageddon";
import { FactionState, House, Owner, Position, Walker, type FactionId } from "../components";
import {
  ARMAGEDDON_MANA_COST,
  ARMAGEDDON_POPULATION_RATIO,
  EARTHQUAKE_MANA_COST,
  ENEMY_PERSONALITY_TUNING,
  GUARDIAN_MANA_COST,
  KNIGHT_MANA_COST,
  MIN_ARMAGEDDON_TIME,
  VOLCANO_MANA_COST,
  VOLCANO_POPULATION_RATIO,
} from "../constants";
import { findFactionEntity, trySpendMana } from "../faction";
import { guardianify, knightify } from "../hero";
import { totalPopulation } from "../population";
import { collapseSwampsNear } from "../swamp";
import { eruptVolcano } from "../volcano";
import { ALL_MIRACLES, type EnemyPersonality, type MiracleId } from "../worlds";
import { distance, type Point } from "./geometry";

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
  | { type: "knight" }
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
 *    or too early to tell) picks knight, the unconditional attacker.
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
 * densestOpponentCluster rather than uniformly at random: a real
 * opponent would aim for wherever hits the most houses, not a
 * coin-flip. Each branch spends mana through trySpendMana exactly like
 * a player's tap, so an enemy that can't afford a step simply falls
 * through to a cheaper one (or does nothing) rather than acting for
 * free — and a branch this world's allowedMiracles hasn't unlocked
 * falls through the exact same way, so an early world that's only
 * unlocked earthquake never sees the enemy volcano/knight/armageddon
 * it either. Skips everything once finalBattle is set, same as
 * createEnemyAiSystem.
 *
 * The 最終決戦 branch additionally waits until minArmageddonTime has
 * elapsed — see plan/0045-armageddon-timing.md. Without it, a match's
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
      const preferredHeroKind = theirPopulation > 0 && populationRatio < 1 + tuning.heroPreferenceBias ? "guardian" : "knight";
      const heroCost = preferredHeroKind === "guardian" ? GUARDIAN_MANA_COST : KNIGHT_MANA_COST;
      const leader = world.get(state.leaderId, Walker);

      if (allowedMiracles.includes(preferredHeroKind) && leader && leader.state !== preferredHeroKind && trySpendMana(world, factionId, heroCost)) {
        if (preferredHeroKind === "guardian") guardianify(world, factionId);
        else knightify(world, factionId);
        onAction({ type: preferredHeroKind });
        return;
      }
    }

    if (allowedMiracles.includes("volcano") && populationRatio >= VOLCANO_POPULATION_RATIO * tuning.volcanoRatioMultiplier) {
      const target = densestOpponentCluster(world, opponentId, DEFAULT_VOLCANO_RADIUS, rng);
      if (target && trySpendMana(world, factionId, VOLCANO_MANA_COST)) {
        applyVolcano(heightmap, target.x, target.y);
        eruptVolcano(world, target.x, target.y, DEFAULT_VOLCANO_RADIUS);
        onAction({ type: "volcano", position: target });
        return;
      }
    }

    if (!allowedMiracles.includes("earthquake")) return;
    const target = densestOpponentCluster(world, opponentId, DEFAULT_EARTHQUAKE_RADIUS, rng);
    if (target && trySpendMana(world, factionId, EARTHQUAKE_MANA_COST)) {
      applyEarthquake(heightmap, target.x, target.y, undefined, undefined, rng);
      collapseSwampsNear(world, target.x, target.y, DEFAULT_EARTHQUAKE_RADIUS);
      onAction({ type: "earthquake", position: target });
    }
  };
}

/**
 * Picks the opponent house surrounded by the most other opponent houses
 * within `radius` — the settlement an earthquake/volcano would actually
 * hit hardest — instead of a uniformly random one. Ties (including the
 * common case of every house being equally isolated) are broken by rng
 * so a single house still gets picked deterministically under a fixed
 * rng in tests.
 */
function densestOpponentCluster(world: World, opponentId: FactionId, radius: number, rng: () => number): Point | null {
  const positions: Point[] = [];
  for (const entity of world.query(House, Position, Owner)) {
    if (world.get(entity, Owner)!.faction === opponentId) positions.push(world.get(entity, Position)!);
  }
  if (positions.length === 0) return null;

  const scores = positions.map((position) => positions.filter((other) => distance(position, other) <= radius).length);
  const bestScore = Math.max(...scores);
  const contenders = positions.filter((_, index) => scores[index] === bestScore);
  return contenders[Math.floor(rng() * contenders.length)];
}
