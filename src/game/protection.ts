import type { Entity, World } from "../ecs";
import { FactionState, Position, Walker } from "./components";
import { GATHER_RANGE } from "./constants";
import { resistsSchool, type MiracleSchool } from "./miracleSchools";

/**
 * Whether `entity` shrugs off a miracle of `school` right now.
 *
 * Two rules meet here, and every attack miracle asks the same question, so
 * they are asked in one place rather than at nine call sites each:
 *
 * 1. **The hero's own school cannot touch it** — 「同じカテゴリーの攻撃神技
 *    は効果がない」. A standing property of what the walker *is*, so it lives
 *    as a pure function on the state (miracleSchools.ts's resistsSchool).
 * 2. **A leader standing at its own magnet under 集合 is untouchable** —
 *    「リーダーがマグネットに到達すると、その場に停止して青い炎に包まれます
 *    (この間は無敵状態になります)」. A property of *where it is and what its
 *    faction was told*, so it needs the world.
 */
export function resistsMiracle(world: World, entity: Entity, school: MiracleSchool): boolean {
  const walker = world.get(entity, Walker);
  if (!walker) return false;
  return resistsSchool(walker.state, school) || isShieldedAtMagnet(world, entity);
}

/**
 * 「リーダーがマグネットに到達すると、その場に停止して青い炎に包まれます
 * (この間は無敵状態になります)」.
 *
 * The blue flame, and the reason 集合 is a defensive order as well as an
 * offensive one: the leader an enemy god most wants to kill is safe for
 * exactly as long as you leave the order set. The original's own account of
 * an earthquake cast at a mustering faction says what that costs — 「マグ
 * ネットに重なっている間(青い炎に包まれた状態)は無敵だが、集まってくる
 * ウォーカーが次々に地割れに落ちていくため、集合を解除することが多い。
 * **その瞬間にリーダーも地割れに落ちる**」. The shield protects one walker
 * while everyone walking toward it dies, so holding it is a decision rather
 * than a free save.
 *
 * Bound to 集合 alone, not to 集結シンボルへ: the flame is what the leader
 * does on *arriving* at the flag and stopping there, and under 集結シンボルへ
 * it is leading a march rather than waiting at one.
 */
export function isShieldedAtMagnet(world: World, entity: Entity): boolean {
  const pos = world.get(entity, Position);
  if (!pos) return false;

  for (const factionEntity of world.query(FactionState)) {
    const state = world.get(factionEntity, FactionState)!;
    if (state.leaderId !== entity) continue;
    if (state.behaviorMode !== "gather") return false;
    return Math.hypot(pos.x - state.shrinePosition.x, pos.y - state.shrinePosition.y) <= GATHER_RANGE;
  }
  return false;
}
