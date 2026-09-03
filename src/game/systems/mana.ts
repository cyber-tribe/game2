import type { System } from "../../ecs";
import { HOUSE_LEVELS, MAX_MANA } from "../constants";
import { FactionState, House, Owner } from "../components";

/**
 * Each faction's mana grows at the combined mana rate of every house it
 * owns, per docs/game-system.md ("信者の総人口に比例して自動蓄積"),
 * clamped at MAX_MANA (the mana gauge's fixed width — see its doc comment).
 * House count is small enough in this prototype that the per-faction
 * O(houses) scan is not worth indexing away.
 */
export const manaSystem: System = (world, deltaSeconds) => {
  for (const factionEntity of world.query(FactionState)) {
    const faction = world.get(factionEntity, FactionState)!;
    let manaRate = 0;

    for (const houseEntity of world.query(House, Owner)) {
      const owner = world.get(houseEntity, Owner)!;
      if (owner.faction !== faction.id) continue;
      manaRate += HOUSE_LEVELS[world.get(houseEntity, House)!.level].manaRate;
    }

    world.add(factionEntity, FactionState, {
      ...faction,
      mana: Math.min(MAX_MANA, faction.mana + manaRate * deltaSeconds),
    });
  }
};
