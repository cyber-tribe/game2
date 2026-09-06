import { defineComponent, type Entity } from "../ecs";

export type FactionId = "player" | "enemy";

export interface Position {
  x: number;
  y: number;
}

export interface Owner {
  faction: FactionId;
}

/**
 * Which hero a promoted leader has become — see hero.ts's promoteHero and
 * HERO_TRAITS in constants.ts.
 *
 * The four named ones are the original's own heroes
 * (docs/original-miracles.md #3/#15/#19/#23), one per element, and they
 * exist as separate kinds because each carries a *different* rule rather
 * than a different number:
 *
 * - "perseus" — 「標準的な戦闘型で、敵地へ進んで攻撃する基準の英雄」.
 *   This is exactly what game2 called 騎士 before they had names, kept
 *   unchanged so the baseline it is the baseline *of* stays put.
 * - "hercules" — 「戦闘力が最も高い。地割れに落ちない」. The counter to
 *   an earthquake's crevice (systems/crevice.ts).
 * - "odysseus" — 「移動速度が速い」. Compounds with a road
 *   (systems/movement.ts), which is the only other thing that moves a
 *   walker faster.
 * - "achilles" — 「火が効かず焼死しない」. The counter to fire rain, and
 *   so to a forest turned against its owner (game/fire.ts).
 * - "helen" — 「女性英雄。**敵と戦わない**。敵信者を魅了・拘束して建物から
 *   引き離し連れ回す。ヘレンが死ぬと拘束は解ける。敵の人口・建築基盤を崩す」.
 *   The one hero that wins nothing by force: she takes an enemy's people
 *   away from their work rather than killing them, and she is the only
 *   walker in the game that cannot fight at all (systems/helen.ts).
 * - "adonis" — 「戦闘に勝つと2体に分裂する（分裂後は体力が半分）。増やし
 *   すぎは英雄死亡時のマナ損失というリスクを伴う」. The only hero whose
 *   trait is a rule about *winning* rather than about surviving something
 *   (systems/combat.ts), and the only one that can end up outnumbering the
 *   army it came from.
 *
 * "guardian" is game2's own, not the original's — a defensive hero that
 * only engages threats near its own houses (see guardianTargetingSystem).
 * The original has no such hero, but removing a working miracle to match a
 * roster would be a loss, so it stays alongside them, like 平坦化 does
 * among the terrain tools.
 */
export type HeroKind = "perseus" | "hercules" | "odysseus" | "achilles" | "adonis" | "helen" | "guardian";

/**
 * "seeking" and the hero kinds are driven by systems in this slice: the
 * four attacking heroes via heroAdvanceTargetingSystem (hunt anywhere, burn
 * houses), "guardian" via guardianTargetingSystem (only engages threats near
 * its own faction's houses, captures normally) — both also get special-cased
 * handling in houseCaptureSystem and drowning.ts's open-water immunity,
 * see isHeroState below. "traveling" and "fighting" remain placeholders.
 */
export type WalkerState = "seeking" | "traveling" | "fighting" | HeroKind;

/** Every HeroKind, in the order the toolbar lists them. */
export const HERO_KINDS: readonly HeroKind[] = ["perseus", "hercules", "odysseus", "achilles", "adonis", "helen", "guardian"];

/**
 * The attacking heroes: every kind that marches on the enemy and burns
 * what it reaches, i.e. all of the original's own four. Kept as its own
 * list rather than "everything except guardian" so that adding アドニス
 * (#10) or トロイのヘレン (#28) — neither of which behaves like either —
 * is a matter of deciding which list they join, not of discovering that
 * the negation quietly swept them up.
 */
export const ADVANCING_HERO_KINDS: readonly HeroKind[] = ["perseus", "hercules", "odysseus", "achilles", "adonis"];

/** Whether `state` is an attacking hero — see ADVANCING_HERO_KINDS. */
export function isAdvancingHeroState(state: WalkerState): boolean {
  return (ADVANCING_HERO_KINDS as readonly string[]).includes(state);
}

/**
 * Whether `state` is one of the hero states (see HERO_KINDS) —
 * shared by houseCaptureSystem (hero-specific capture/burn rules) and
 * drowning.ts (open-water immunity) so both stay in sync with whatever
 * hero kinds promoteHero actually produces, rather than each hardcoding
 * its own per-kind check. Notably NOT used by swampSystem: heroes drown
 * in swamps just like anyone else.
 */
export function isHeroState(state: WalkerState): boolean {
  return (HERO_KINDS as readonly string[]).includes(state);
}

export interface Walker {
  /** Internal head-count / combat power this walker represents. */
  strength: number;
  state: WalkerState;
  /** Tiles per second. */
  speed: number;
  /**
   * What this walker's strength and speed were before any hero miracle
   * multiplied them (see hero.ts's promoteHero and HERO_TRAITS). Absent on
   * a walker that has never been promoted.
   *
   * Kept so re-specializing from one hero to another re-derives both
   * numbers from the same base instead of compounding: without it, a
   * leader cycled ヘラクレス → オディッセウス → ヘラクレス would come out
   * four times as strong as one that was simply cast ヘラクレス once, and
   * the cheapest path to the strongest hero would be to buy every other
   * hero first.
   */
  heroBase?: { strength: number; speed: number };
}

/** Where a Position-having entity is currently walking to. Removed on arrival. */
export interface MoveTarget {
  x: number;
  y: number;
}

/**
 * Attached to a Walker only while it's standing in a genuine body of water
 * (see world/heightmap.ts's isInWaterPool) — see systems/drowning.ts, the
 * only reader/writer. `breath` counts down each tick it stays submerged;
 * reaching dry land removes this component outright (full, instant
 * recovery — per feedback: "陸に上がると普段の動きに戻る"), rather than
 * the breath just pausing where it was.
 */
export interface Drowning {
  breath: number;
}

export type HouseLevel = "hut" | "lodge" | "manor" | "castle";

export interface House {
  level: HouseLevel;
  /** Accumulated population; spawns a walker and resets once it hits capacity. */
  population: number;
}

/**
 * The four influence modes from docs/game-system.md, all enforced by
 * dedicated systems: "settle" (the wander/settle systems' implicit
 * default), "gather" (gatherTargetingSystem + gatherSystem — also the only
 * mode leaderSystem promotes a leader under), "fight" (fightTargetingSystem),
 * and "goToShrine" (goToShrineSystem).
 */
export type BehaviorMode = "settle" | "gather" | "goToShrine" | "fight";

/**
 * One FactionState entity per side. Mana is the only resource spent on
 * miracles; behaviorMode/shrinePosition steer the gather/goToShrine/fight
 * walker systems. leaderId is maintained by leaderSystem, which — only
 * while behaviorMode is "gather" — promotes whichever of this faction's
 * walkers is first to arrive at the shrine; it isn't set at faction
 * creation and stays unset under every other mode until gather produces
 * one. finalBattle is set once by the "最終決戦" miracle and, once true,
 * makes createEnemyAiSystem stop overriding behaviorMode — there is no
 * walking it back.
 */
export interface FactionState {
  id: FactionId;
  mana: number;
  behaviorMode: BehaviorMode;
  shrinePosition: Position;
  leaderId?: Entity;
  finalBattle?: boolean;
}

/**
 * A hazard placed at a Position: any walker that wanders within `radius`
 * drowns. Consumes one unit of `remainingCapacity` per walker swallowed
 * and disappears once it hits zero — per docs/game-system.md, "一定数を
 * 飲み込むと消えるタイプ". The permanent variant isn't implemented.
 */
export interface Swamp {
  radius: number;
  remainingCapacity: number;
}

/**
 * An enemy walker held by トロイのヘレン (docs/original-miracles.md #28):
 * 「敵信者を魅了・拘束して建物から引き離し連れ回す。ヘレンが死ぬと拘束は
 * 解ける」.
 *
 * A charmed walker keeps its own Owner — it is not converted (that is
 * 聖水の泉's job, see HolyWater). It simply stops doing anything for its
 * side and trails after Helen, which is how she 「敵の人口・建築基盤を崩す」
 * without killing anyone: those people are still counted, still alive, and
 * no longer anywhere near their houses.
 *
 * `by` is the Helen holding it, so the hold can be released when she dies.
 */
export interface Charmed {
  by: Entity;
}

/**
 * The original's 竜巻 (docs/original-miracles.md #17): 「一定時間ランダムに
 * 移動し被害を与える。信者を巻き込んで運び体力を減らす。**水地形へ入ると
 * 渦巻きへ変化する**」.
 *
 * The first hazard in game2 that *moves*. Every other one is a place —
 * a swamp, a crevice, a patch of rot — and the player's decision about it
 * is where to put it. A tornado's decision is where to aim it and then
 * living with the fact that it wanders, which is a different kind of
 * miracle and the reason both this and Whirlpool below are worth the
 * machinery.
 *
 * `heading` is kept between ticks so the wander reads as a path rather
 * than a jitter — see systems/tornado.ts.
 */
export interface Tornado {
  /** Seconds of life left; the tornado is removed at zero. */
  remaining: number;
  headingX: number;
  headingY: number;
}

/**
 * The original's 病原菌 (docs/original-miracles.md #4): 「信者を感染させ
 * 周囲へ広げる。感染者はマナを供給できず、ハルマゲドンにも参加できない。
 * **即死ではなく国力を長期的に削る**」.
 *
 * The only miracle in the game that takes nothing away — no walker dies,
 * no house falls, no ground is ruined. It simply makes what a faction owns
 * stop *working*: an infected house earns nothing (systems/mana.ts) and an
 * infected walker will not answer the final battle (armageddon.ts). Cast
 * on a thriving settlement it does not look like an attack at all for the
 * first half-minute, which is exactly what 「国力を長期的に削る」 means.
 *
 * Carried by both walkers and houses — a sick person who settles builds a
 * sick house — and it burns out on its own after PLAGUE_DURATION, which is
 * what keeps a plague from ending every match in a stalemate where nobody
 * can afford anything.
 */
export interface Infected {
  /** Seconds until this one recovers. */
  remaining: number;
}

/**
 * The original's 嵐 (docs/original-miracles.md #18): 「雷雲を発生させ周辺へ
 * 継続的に落雷。単発の雷と違い**範囲持続型**。この雷は**人には直接
 * 当たらない**」.
 *
 * The one lasting hazard that does not move. 竜巻 and 火柱 wander and are
 * dangerous wherever they end up; a storm sits over the ground it was cast
 * on and makes *that* ground unusable — which is the only way an area-denial
 * miracle can exist in a game where everything else either lands once or
 * walks away.
 */
export interface Storm {
  /** Seconds of life left; the cloud is removed at zero. */
  remaining: number;
  /** Seconds until the next bolt falls. */
  untilStrike: number;
}

/**
 * The original's 火柱 (docs/original-miracles.md #21): 「移動する火柱。
 * ランダムに動き、地面を荒地化し人を焼死させ建物を崩壊させる。固定AoEでは
 * なく**移動する危険地帯**」.
 *
 * Shaped like a Tornado — a lifetime and a heading — because they are the
 * same kind of thing, a hazard that walks. What separates them is what
 * they do to what they walk over: a tornado carries people off and leaves
 * the ground alone, a fire pillar burns everything and leaves the ground
 * dead.
 */
export interface FirePillar {
  /** Seconds of life left; the pillar is removed at zero. */
  remaining: number;
  headingX: number;
  headingY: number;
}

/**
 * The original's 渦巻き (docs/original-miracles.md #26): 「海上を移動しながら
 * 陸地を削って水へ戻す。一定時間で分裂して被害範囲が広がる」.
 *
 * Only ever born from a Tornado that reached water (the original's own
 * 竜巻 → 渦巻き, "属性をまたぐ連鎖") — there is no 渦巻き miracle of its
 * own here, because casting one directly would throw away the interaction
 * that is the whole reason it exists.
 */
export interface Whirlpool {
  /** Seconds of life left; the whirlpool is removed at zero. */
  remaining: number;
  /** Seconds until it splits in two; splitting is what makes it spread. */
  untilSplit: number;
  /** How many more times this whirlpool (and its children) may split. */
  splitsLeft: number;
  headingX: number;
  headingY: number;
}

/**
 * The original's 聖水の泉 (docs/original-miracles.md #27): 「落ちた信者が
 * 敵側へ寝返る。英雄まで寝返る可能性があり、強い英雄を奪えば形勢逆転できる。
 * 再度落ちると元へ戻る場合もある」.
 *
 * Shaped like a Swamp on purpose — a radius and a capacity — because it is
 * the same kind of thing: a patch of ground that does something to whoever
 * walks into it, a fixed number of times, and then is gone. What differs is
 * only that a swamp deletes them and a spring takes them.
 *
 * The spring's own Owner is which side converts walkers walk out as, so
 * "再度落ちると元へ戻る" needs no rule of its own: a walker taken by the
 * player's spring and then wandering into the enemy's changes sides again,
 * because each spring only ever converts walkers that are not already its
 * owner's.
 */
export interface HolyWater {
  radius: number;
  remainingCapacity: number;
}

/**
 * A brief rest a hero takes right after resolving a house — a knight
 * burning it, or a guardian capturing one — before its targeting system
 * will send it marching after its next target. See knightTargetingSystem/
 * guardianTargetingSystem's doc comments for why this exists. Only ever
 * attached to a hero-state Walker (see isHeroState); removed once
 * `remaining` counts down to 0.
 */
export interface HeroCooldown {
  remaining: number;
}

export const Position = defineComponent<Position>("Position");
export const Owner = defineComponent<Owner>("Owner");
export const Walker = defineComponent<Walker>("Walker");
export const MoveTarget = defineComponent<MoveTarget>("MoveTarget");
export const House = defineComponent<House>("House");
export const FactionState = defineComponent<FactionState>("FactionState");
export const Swamp = defineComponent<Swamp>("Swamp");
export const HolyWater = defineComponent<HolyWater>("HolyWater");
export const Tornado = defineComponent<Tornado>("Tornado");
export const Whirlpool = defineComponent<Whirlpool>("Whirlpool");
export const FirePillar = defineComponent<FirePillar>("FirePillar");
export const Storm = defineComponent<Storm>("Storm");
export const Infected = defineComponent<Infected>("Infected");
export const Charmed = defineComponent<Charmed>("Charmed");
export const HeroCooldown = defineComponent<HeroCooldown>("HeroCooldown");
export const Drowning = defineComponent<Drowning>("Drowning");
