import type { System } from "../../ecs";
import { HOUSE_LEVELS, HUT_MANA_RATE_CAP, MAX_MANA } from "../constants";
import { FactionState, House, Owner } from "../components";

/**
 * Each faction's mana grows at the combined mana rate of every house it
 * owns, per docs/game-system.md ("信者の総人口に比例して自動蓄積"),
 * clamped at MAX_MANA (the mana gauge's fixed width — see its doc comment).
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
      const level = world.get(houseEntity, House)!.level;
      if (level === "hut") {
        hutManaRate += HOUSE_LEVELS.hut.manaRate;
      } else {
        otherManaRate += HOUSE_LEVELS[level].manaRate;
      }
    }

    const manaRate = Math.min(HUT_MANA_RATE_CAP, hutManaRate) + otherManaRate;
    world.add(factionEntity, FactionState, {
      ...faction,
      mana: Math.min(MAX_MANA, faction.mana + manaRate * deltaSeconds),
    });
  }
};
