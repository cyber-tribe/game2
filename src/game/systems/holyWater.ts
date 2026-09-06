import type { System } from "../../ecs";
import { HolyWater, Owner, Position, Walker } from "../components";
import type { OnImpactEffect } from "./effects";
import { distance } from "./geometry";

export interface HolyWaterConfig {
  /** Called once per walker that changes sides — see systems/effects.ts. */
  onImpact: OnImpactEffect;
}

/**
 * Any walker that steps into a 聖水の泉 belonging to the other side changes
 * sides — the original's 「落ちた信者が敵側へ寝返る。英雄まで寝返る可能性が
 * あり、強い英雄を奪えば形勢逆転できる」 (docs/original-miracles.md #27).
 *
 * **Heroes convert too, and that is the point.** Nothing here checks
 * isHeroState: taking an enemy ヘラクレス is the "形勢逆転" the original
 * describes, and a spring that everything survives except the one unit
 * worth stealing would be a worse version of a swamp. It is also the
 * reason the interaction only became worth having once the heroes had
 * their own identities (plan/archived/0100) — before that, stealing a
 * hero and stealing a walker differed by a targeting rule.
 *
 * A converted walker keeps everything else it is: its strength, its hero
 * kind, its position. Only Owner changes, so the enemy's strongest unit
 * arrives on your side exactly as strong as it was on theirs.
 *
 * Each conversion consumes one unit of the spring's remainingCapacity; once
 * that hits zero the spring dries up and is removed — the same bounded
 * shape as a swamp, and the reason a spring cannot quietly swallow a whole
 * army over the course of a match.
 *
 * "再度落ちると元へ戻る" is not implemented as a rule: it simply happens,
 * because a spring only converts walkers that aren't already its owner's,
 * so a walker taken by one side and later caught by the other side's own
 * spring changes back.
 */
export function createHolyWaterSystem(config: Partial<HolyWaterConfig> = {}): System {
  const onImpact = config.onImpact ?? (() => {});

  return (world) => {
    for (const springEntity of world.query(HolyWater, Position, Owner)) {
      const springPos = world.get(springEntity, Position)!;
      const springFaction = world.get(springEntity, Owner)!.faction;

      for (const walkerEntity of world.query(Walker, Position, Owner)) {
        if (!world.isAlive(springEntity)) break;

        const owner = world.get(walkerEntity, Owner)!;
        if (owner.faction === springFaction) continue;

        const walkerPos = world.get(walkerEntity, Position)!;
        const spring = world.get(springEntity, HolyWater)!;
        if (distance(springPos, walkerPos) > spring.radius) continue;

        world.add(walkerEntity, Owner, { faction: springFaction });
        onImpact({ position: walkerPos, type: "converted" });

        const remainingCapacity = spring.remainingCapacity - 1;
        if (remainingCapacity <= 0) {
          world.destroyEntity(springEntity);
        } else {
          world.add(springEntity, HolyWater, { ...spring, remainingCapacity });
        }
      }
    }
  };
}
