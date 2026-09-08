import type { System } from "../../ecs";
import { FOLLOWER_MANA_RATE, HOUSE_LEVELS, HUT_MANA_RATE_CAP, MAX_MANA } from "../constants";
import { FactionState, House, Infected, Owner } from "../components";
import { fieldPopulation } from "../population";

/**
 * Each faction's mana grows at the combined mana rate of every house it
 * owns, per docs/game-system.md ("信者の総人口に比例して自動蓄積"),
 * clamped at MAX_MANA (the mana gauge's fixed width — see its doc comment).
 * A house's own contribution scales with its actual House.population
 * (0..HOUSE_LEVELS[level].capacity — see houseGrowth.ts, which keeps it in
 * that range) as a fraction of that level's tuned manaRate: a freshly
 * settled hut with nobody in it yet produces nothing, and a house rebuilds
 * its output gradually after each walker spawn empties its population back
 * toward 0, rather than jumping straight back to full rate. A house sitting
 * at full population still produces exactly HOUSE_LEVELS[level].manaRate,
 * so plan/archived/0018-mana-pacing-rebalance.md's tuning against
 * EARTHQUAKE_MANA_COST/MAX_MANA still holds at steady state.
 * Hut-level houses' contribution is additionally capped at HUT_MANA_RATE_CAP
 * regardless of how many there are — see its doc comment — so a faction
 * has to actually upgrade some houses (lodge and above are uncapped) to
 * out-earn that ceiling, rather than just letting population overflow into
 * more huts. House count is small enough in this prototype that the
 * per-faction O(houses) scan is not worth indexing away.
 */
export const manaSystem: System = (world, deltaSeconds) => {
  for (const factionEntity of world.query(FactionState)) {
    const faction = world.get(factionEntity, FactionState)!;
    let hutManaRate = 0;
    let otherManaRate = 0;

    for (const houseEntity of world.query(House, Owner)) {
      const owner = world.get(houseEntity, Owner)!;
      if (owner.faction !== faction.id) continue;
      // 病原菌 「感染者はマナを供給できず」 (docs/original-miracles.md #4).
      // The house still stands, still holds its people, still counts for
      // survival — it simply stops paying, which is the whole miracle.
      if (world.has(houseEntity, Infected)) continue;
      const house = world.get(houseEntity, House)!;
      const { capacity, manaRate: levelManaRate } = HOUSE_LEVELS[house.level];
      const rate = levelManaRate * (house.population / capacity);
      if (house.level === "hut") {
        hutManaRate += rate;
      } else {
        otherManaRate += rate;
      }
    }

    // 「マナは信者数と時間経過に応じて蓄積される」: followers out on the
    // field believe too. Pooled with the huts and capped with them — see
    // FOLLOWER_MANA_RATE — so an established village, already at the
    // ceiling, notices nothing, while a faction that has just marched or
    // sprogged its people out of doors keeps the income those people were
    // producing indoors instead of dropping to zero.
    const fieldManaRate = fieldPopulation(world, faction.id) * FOLLOWER_MANA_RATE;
    const manaRate = Math.min(HUT_MANA_RATE_CAP, hutManaRate + fieldManaRate) + otherManaRate;
    world.add(factionEntity, FactionState, {
      ...faction,
      mana: Math.min(MAX_MANA, faction.mana + manaRate * deltaSeconds),
    });
  }
};
