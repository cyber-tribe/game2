import { Application, Container, Rectangle, type FederatedPointerEvent } from "pixi.js";
import { playMiracleSound } from "./audio/miracleSounds";
import {
  ARMAGEDDON_MANA_COST,
  EARTHQUAKE_MANA_COST,
  ENEMY_PERSONALITY_LABELS,
  REEF_MANA_COST,
  FIRE_RAIN_MANA_COST,
  FLOWER_MANA_COST,
  FOREST_MANA_COST,
  ROAD_MANA_COST,
  WALL_MANA_COST,
  MEGALITH_MANA_COST,
  FUNGUS_MANA_COST,
  TSUNAMI_MANA_COST,
  GUARDIAN_MANA_COST,
  PERSEUS_MANA_COST,
  HERCULES_MANA_COST,
  ODYSSEUS_MANA_COST,
  ACHILLES_MANA_COST,
  ADONIS_MANA_COST,
  HELEN_MANA_COST,
  MAX_MANA,
  SHRINE_MOVE_MANA_COST,
  SWAMP_CAPACITY,
  SWAMP_MANA_COST,
  SWAMP_RADIUS,
  HOLY_WATER_MANA_COST,
  TORNADO_MANA_COST,
  WHIRLPOOL_MANA_COST,
  FIRE_PILLAR_MANA_COST,
  LIGHTNING_MANA_COST,
  STORM_MANA_COST,
  PLAGUE_MANA_COST,
  HURRICANE_MANA_COST,
  TERRAIN_EDIT_MANA_COST,
  TERRAIN_EDIT_RULE_LABELS,
  TERRAIN_LABELS,
  VOLCANO_MANA_COST,
} from "./game/constants";
import type { EnemyMiracleEvent } from "./game/systems/enemyMiracles";
import { trySpendMana } from "./game/faction";
import { drownFlood } from "./game/flood";
import { Simulation, type GameOutcome, type InspectableEntity, type MatchEvent } from "./game/simulation";
import type { HeroKind } from "./game/components";

/**
 * What each hero miracle costs. One table rather than five branches: the
 * heroes are the same action ("promote the leader") at five prices, and
 * both the toolbar's affordability dimming and applyTool's own dispatch
 * read it, so a new hero cannot be added to one and forgotten in the other.
 */
const HERO_MANA_COST: Record<HeroKind, number> = {
  perseus: PERSEUS_MANA_COST,
  hercules: HERCULES_MANA_COST,
  odysseus: ODYSSEUS_MANA_COST,
  achilles: ACHILLES_MANA_COST,
  adonis: ADONIS_MANA_COST,
  helen: HELEN_MANA_COST,
  guardian: GUARDIAN_MANA_COST,
};
import { createHolyWater } from "./game/holyWater";
import { applyHurricane } from "./game/hurricane";
import { createFirePillar } from "./game/firePillar";
import { strikeLightning } from "./game/lightning";
import { seedPlague } from "./game/plague";
import { createStorm } from "./game/storm";
import { createTornado, createWhirlpool } from "./game/tornado";
import { collapseSwampsNear, createSwamp } from "./game/swamp";
import { burnFire } from "./game/fire";
import { eruptVolcano } from "./game/volcano";
import { raiseMegalith } from "./game/megalith";
import { ALL_MIRACLES, WORLDS, nextWorldId, unlockedCountForPassword, type MiracleId, type WorldDefinition } from "./game/worlds";
import { EntityLayer } from "./render/EntityLayer";
import { describeInspectableEntity } from "./render/entityInfoLabel";
import { Hud } from "./render/Hud";
import { MIRACLE_SCHOOLS } from "./game/miracleSchools";
import { IsoRenderer, visibleTileBounds, type TileBounds } from "./render/IsoRenderer";
import { describeMatchEvent, formatMatchTime } from "./render/matchEventLabels";
import { Minimap, minimapHeight } from "./render/Minimap";
import { PopulationGauge } from "./render/PopulationGauge";
import { GAME_PALETTE } from "./render/palette";
import { mountCommandIcons } from "./ui/commandIcons";
import { loadCommandIcons } from "./ui/pixelIcons";
import { StatusPanel } from "./ui/statusPanel";
import { wireToolbar, type ToolMode } from "./ui/toolbar";
import { AUTO_FLATTEN_SIZE, DEFAULT_EARTHQUAKE_RADIUS, applyEarthquake, applyFireRain, applyFlower, applyForest, applyFungus, DEFAULT_FLOWER_RADIUS, applyReef, applyRoad, applyWall, applyMegalith, applyTsunami, sampleElevation, applyVolcano, createHeightmap, flattenTile, isTerrainEditAllowed, megalithScatterCandidates, planAutoFlatten, raiseVertex } from "./world/heightmap";

/**
 * The camera's fixed base scale — see layout()'s doc comment for why this
 * no longer auto-fits the whole (now much bigger) map to the screen. 1
 * matches IsoRenderer's own TILE_WIDTH/TILE_HEIGHT, i.e. tiles render at
 * their native, comfortably tap-able size.
 */
const BASE_MAP_SCALE = 1;
/**
 * Bounds on the pinch-zoom multiplier applied on top of BASE_MAP_SCALE —
 * see zoomFactor below. 0.5 lets a player pinch out far enough to plan
 * across a wider area at once; 2.5 lets them pinch in close enough to
 * place a precise edit.
 */
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2.5;
/** A finger-drag shorter than this (px) is treated as a tap, not a pan. */
const DRAG_THRESHOLD = 10;
/**
 * How long (ms) a single-finger press must stay still before it engages
 * "ブラシ" continuous terraforming — see the pointerdown/pointermove
 * handlers below. Long enough that an ordinary quick tap or the start of a
 * pan never accidentally triggers it, short enough that deliberately
 * holding still doesn't feel like waiting.
 */
const LONG_PRESS_DURATION_MS = 350;
/**
 * How often a held 地下巨石 raises the next stone — 「発生ボタンを押し続けると、
 * 一帯により多くの巨石を発生させる」.
 *
 * Far slower than the terraforming brush, which is bounded by the pointer
 * actually moving onto a new tile. This one repeats while the finger sits
 * still, and each repeat spends MEGALITH_MANA_COST, so the interval is
 * what keeps "hold to scatter a field of stones" from being "hold to empty
 * the mana bar before you notice".
 */
const MEGALITH_HOLD_INTERVAL_MS = 500;
/**
 * How much one mouse-wheel "notch" (deltaY around ±100) zooms the map on
 * PC — see plan/0039-pc-support.md. Chosen so a single notch feels close
 * to one pinch-zoom step; exponential so repeated notches compound evenly
 * in both directions instead of the zoom-out direction stalling near 0.
 */
const WHEEL_ZOOM_SPEED = 0.0015;
/**
 * Rotation (radians) per Q/E keypress on PC — a mouse can't reproduce the
 * two-finger twist gesture applyPinchTransform was built for, so this is
 * the desktop equivalent. 15° keeps a single press feeling like a nudge,
 * not a full spin.
 */
const KEY_ROTATE_STEP = Math.PI / 12;
/** How long #tutorial-hint stays up if the player never makes a terrain edit. */
const TUTORIAL_HINT_TIMEOUT_MS = 15000;
/** How long a triggerShake() camera shake takes to decay to nothing. */
const SHAKE_DURATION = 0.3;
/** Screen size (px) of the top-right overview map — see render/Minimap.ts. */
const MINIMAP_SIZE = 72;

/** Breathing room between the world map's lowest shard and the HUD text below it. */
const HUD_GAP_BELOW_MINIMAP = 8;
/**
 * Width of the population colonnade hanging opposite the overview map — see
 * render/PopulationGauge.ts. Wider than the minimap because it is read at a
 * glance rather than studied, and its whole content is a left/right split.
 */
const POPULATION_GAUGE_WIDTH = 96;

/**
 * The device's top safe-area inset (notch/status bar), read from the CSS
 * custom property index.html defines from `env(safe-area-inset-top)`. An
 * installed standalone PWA draws edge-to-edge under `viewport-fit=cover`
 * and needs this to keep the HUD/map clear of the status bar; a plain
 * browser tab reports 0 here since its own chrome already occupies that
 * space.
 */
function getSafeAreaInsetTop(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-top");
  return parseFloat(value) || 0;
}

/**
 * Best-effort haptic feedback for casting a miracle — the Vibration API is
 * unsupported on iOS Safari (and thus on an iOS home-screen install), so
 * this silently does nothing there instead of throwing. Not used for the
 * plain raise/lower terrain edit: that's the core, extremely frequent
 * action, and buzzing on every tap would feel naggy rather than special.
 */
function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

async function bootstrap(world: WorldDefinition) {
  const app = new Application();
  await app.init({
    resizeTo: window,
    // The off-map void. Deliberately the palette's darkest ink rather than
    // the navy this project started with: a blue void behind a sandstone UI
    // and green land reads as a modern web canvas, where the original's
    // out-of-bounds area is near-black (see plan/archived/0088-palette-calibration.md).
    background: GAME_PALETTE.ink,
    // Off, not on: MSAA roughly doubled full-screen frame cost in testing
    // (see plan/0062-original-scale-map.md) once the map — and so the
    // terrain mesh redrawn every frame — grew from ≤32x32 to 64x64. This
    // game's flat-shaded low-poly style barely shows the difference; a
    // lower, steadier frame rate would be far more noticeable.
    antialias: false,
  });

  const container = document.getElementById("app");
  if (!container) throw new Error("#app element not found");
  container.appendChild(app.canvas);

  const heightmap = createHeightmap(world.worldWidth, world.worldHeight, world.terrain);
  const renderer = new IsoRenderer(heightmap);

  // Per docs/game-system.md's "各ワールドは...使用可能な奇跡の制限などが
  // 異なり" — most worlds allow raise/lower freely, but a minority (see
  // WORLDS in game/worlds.ts) restrict terraforming to one direction. See
  // TerrainEditRule's doc comment for why this doesn't take away the
  // player's ability to flatten land, just which direction does it.
  const terrainEditRule = world.terrainEditRule;

  // The other half of "使用可能な奇跡の制限": which discretionary miracles
  // (everything but 隆起/沈降/照会 — see MiracleId's doc comment) this
  // world has unlocked at all. Non-miracle ToolModes always pass.
  const isAllowedMiracle = (mode: ToolMode): boolean =>
    !(ALL_MIRACLES as readonly string[]).includes(mode) || world.allowedMiracles.includes(mode as MiracleId);

  // A wrapper around renderer.view purely for screen shake (see
  // triggerShake below): renderer.view.position is the "real" camera
  // state that pan/zoom/rotate all read and write, so shake is kept as a
  // separate, temporary offset layered on top rather than fighting with
  // that bookkeeping.
  const worldContainer = new Container();
  worldContainer.addChild(renderer.view);
  app.stage.addChild(worldContainer);

  // A brief camera shake for high-impact miracles (地震/火山/洪水/最終決戦)
  // — per feedback that these otherwise "just change the board" with no
  // sense of impact. Decays linearly over SHAKE_DURATION; ticked below
  // alongside the simulation.
  let shakeTimeRemaining = 0;
  let shakeMagnitude = 0;
  const triggerShake = (magnitude: number) => {
    shakeTimeRemaining = SHAKE_DURATION;
    shakeMagnitude = magnitude;
  };

  // Awaited before the first frame so walkers, buildings and command icons
  // all have their art from the start. Each of these skips drawing rather
  // than throwing until it resolves, so a slow decode would show an empty
  // map and blank buttons rather than crash.
  await Promise.all([EntityLayer.loadAssets(), loadCommandIcons()]);
  const entityLayer = new EntityLayer(renderer);
  renderer.view.addChild(entityLayer.view);

  const hud = new Hud();
  hud.setTerrain(TERRAIN_LABELS[heightmap.terrain]);
  if (terrainEditRule !== "both") hud.setTerrainEditRule(TERRAIN_EDIT_RULE_LABELS[terrainEditRule]);
  app.stage.addChild(hud.view);

  const minimap = new Minimap(heightmap, MINIMAP_SIZE);
  app.stage.addChild(minimap.view);

  // The two things the original hangs in the black space either side of the
  // world: its overview map at top left (on Minimap's own slab) and the
  // population standing at top right, as a colonnade rather than a bar.
  const populationGauge = new PopulationGauge(POPULATION_GAUGE_WIDTH);
  app.stage.addChild(populationGauge.view);

  mountCommandIcons();
  const statusPanel = new StatusPanel(MAX_MANA);

  // The command panel's single message line (see index.html's
  // #panel-message) — replaces the old floating pill toasts
  // (#enemy-event-toast/#entity-info-panel) per plan/archived/0084-original-ui-
  // foundation.md's "画面中央に現代的なfloating toastを出す方式を減らす".
  // Only one message shows at a time; a new one simply pre-empts whatever
  // was showing (both are short-lived, low-frequency notices in practice).
  const panelMessage = document.getElementById("panel-message");
  let panelMessageHideTimeout: ReturnType<typeof setTimeout> | undefined;
  const showPanelMessage = (text: string, durationMs: number, tone: "neutral" | "warning" = "neutral") => {
    if (!panelMessage) return;
    panelMessage.textContent = text;
    panelMessage.classList.toggle("warning", tone === "warning");
    panelMessage.classList.add("visible");
    clearTimeout(panelMessageHideTimeout);
    panelMessageHideTimeout = setTimeout(() => panelMessage.classList.remove("visible"), durationMs);
  };

  // Surfaces enemy-cast miracles even when they happen outside the
  // player's current view — see enemyMiracles.ts for why this matters more
  // now that the enemy AI acts on its own.
  const showEnemyEventToast = (text: string) => showPanelMessage(text, 3000, "warning");

  // Shows one walker/house's own detail under the "照会" tool (see
  // applyTool's "inspect" branch) — docs/game-system.md 11節の情報パネル.
  // Also reused for mana-shortfall/enemy-territory rejection messages
  // (tone: "warning"), which used to have their own floating pill.
  const showEntityInfo = (text: string, tone: "neutral" | "warning" = "neutral") => showPanelMessage(text, 4000, tone);

  // Mirrors the shake magnitudes applyTool uses for the player's own casts
  // of the same miracles (the hero miracles have no player-side shake to
  // match, so keep their own small, hero-scale values).
  const ENEMY_SHAKE_MAGNITUDE: Record<EnemyMiracleEvent["type"], number> = {
    armageddon: 10,
    volcano: 8,
    earthquake: 6,
    fireRain: 4,
    lightning: 6,
    // Neither of these lands with any weight — a spring wells up and a
    // plague shows nothing at all (see game/plague.ts) — so shaking the
    // camera for them would promise damage that isn't there.
    holyWater: 0,
    plague: 0,
    swamp: 0,
    perseus: 3,
    guardian: 3,
  };

  const onEnemyAction = (event: EnemyMiracleEvent) => {
    showEnemyEventToast(describeMatchEvent(event.type, "enemy"));
    triggerShake(ENEMY_SHAKE_MAGNITUDE[event.type]);
    playMiracleSound(event.type);
  };

  const matchRecordPanel = document.getElementById("match-record");
  const matchRecordTitle = document.getElementById("match-record-title");
  const matchRecordList = document.getElementById("match-record-list");
  const playAgainButton = document.getElementById("play-again");
  let matchRecordShown = false;

  // Simplest possible reset: reload the page for a fresh heightmap/Simulation
  // and default camera/UI state, rather than hand-rolling teardown of every
  // stateful object main.ts builds. See plan/0038-play-again.md — this
  // button exists as playtesting infrastructure, not a polished transition.
  playAgainButton?.addEventListener("click", () => {
    window.location.reload();
  });

  // Shown once, the moment the match ends — a bare win/lose line tells
  // none of the match's actual story (see plan/0032-match-event-log.md).
  // Rendered as HTML rather than through Hud's PixiJS Text so a long
  // match's event list can actually scroll (see index.html's #match-record).
  const showMatchRecord = (outcome: GameOutcome, events: readonly MatchEvent[]) => {
    if (!matchRecordPanel || !matchRecordTitle || !matchRecordList) return;
    matchRecordTitle.textContent = outcome.winner ? `GAME OVER — ${outcome.winner} wins` : "GAME OVER — draw";
    matchRecordList.replaceChildren(
      ...events.map((event) => {
        const line = document.createElement("div");
        line.textContent = `${formatMatchTime(event.time)} ${describeMatchEvent(event.type, event.faction)}`;
        return line;
      }),
    );

    // The 征服モード "password" (docs/game-system.md 10節) — only earned
    // by the player actually winning, not the enemy or a draw. Shown here
    // rather than auto-carried into the next page load (see worlds.ts's
    // nextWorldId doc comment): the player writes it down and re-enters it
    // on #world-select next time, the same manual "code on paper" flow the
    // doc's own "パスワード" wording implies.
    if (outcome.winner === "player") {
      const password = nextWorldId(world.id);
      const passwordLine = document.createElement("div");
      passwordLine.id = "match-record-password";
      passwordLine.textContent = password ? `次のワールドのパスワード: ${password}` : "全ワールドを制覇しました！";
      matchRecordList.appendChild(passwordLine);
    }

    matchRecordPanel.classList.remove("hidden");
  };

  const simulation = new Simulation({
    worldWidth: world.worldWidth,
    worldHeight: world.worldHeight,
    heightmap,
    terrainEditRule,
    enemyDecisionInterval: world.enemyDecisionInterval,
    enemyAggressionThreshold: world.enemyAggressionThreshold,
    allowedMiracles: world.allowedMiracles,
    enemyPersonality: world.enemyPersonality,
    enemySchool: world.enemySchool,
    instantDrowning: world.instantDrowning,
    bottomlessSwamp: world.bottomlessSwamp,
    onEnemyAction,
  });


  // The map is now far bigger than any one screen (see
  // plan/0062-original-scale-map.md) — like the original, the camera
  // always renders at a fixed, comfortably tap-able native scale (see
  // IsoRenderer's own TILE_WIDTH/TILE_HEIGHT doc comment) and the player
  // pans to reach the rest, rather than the whole map ever shrinking to
  // fit on screen. currentScale = baseScale * zoomFactor: baseScale is
  // this fixed value, zoomFactor is the player's own pinch-zoom adjustment
  // on top of it (see applyPinchTransform below).
  let baseScale = BASE_MAP_SCALE;
  let zoomFactor = 1;
  let currentScale = baseScale;
  const tutorialHint = document.getElementById("tutorial-hint");
  // Only a mouse-driven device needs telling about the wheel/keyboard
  // controls above — a touchscreen already has the two-finger gesture
  // doing the same job, and this text would just be noise there.
  if (tutorialHint && window.matchMedia("(pointer: fine)").matches) {
    tutorialHint.textContent += "\nPC: ホイールでズーム、Q/Eキーで回転できます。";
  }

  const clampPan = (x: number, y: number): { x: number; y: number } => {
    const halfW = (renderer.mapPixelWidth * currentScale) / 2;
    const halfH = (renderer.mapPixelHeight * currentScale) / 2;
    const marginX = Math.min(120, app.screen.width * 0.3);
    const marginY = Math.min(120, app.screen.height * 0.3);
    return {
      x: Math.min(app.screen.width + halfW - marginX, Math.max(-halfW + marginX, x)),
      y: Math.min(app.screen.height + halfH - marginY, Math.max(-halfH + marginY, y)),
    };
  };

  // Recenters the main view on a world (tile) point without changing zoom
  // or rotation — same pivot math as rotateAroundPivot below, just with a
  // fixed target (the screen center, nudged down by extraOffsetY) instead
  // of the two-finger midpoint. Used by the minimap's "tap to jump" (see
  // render/Minimap.ts's doc comment on why it exists) and by layout()'s
  // one-time initial centering on the player's own shrine, below.
  const centerViewOn = (worldX: number, worldY: number, extraOffsetY = 0) => {
    const local = renderer.project(worldX, worldY);
    const cos = Math.cos(renderer.view.rotation);
    const sin = Math.sin(renderer.view.rotation);
    const scaledX = local.sx * currentScale;
    const scaledY = local.sy * currentScale;
    const target = { x: app.screen.width / 2, y: app.screen.height / 2 + extraOffsetY };
    const next = clampPan(target.x - (scaledX * cos - scaledY * sin), target.y - (scaledX * sin + scaledY * cos));
    renderer.view.position.set(next.x, next.y);
  };

  // Centers on the player's own starting village exactly once — like the
  // original, arriving anywhere else (the map's geometric center, say)
  // would often show nothing but empty land. Only on this first call:
  // recentering again on every later layout() (e.g. a phone rotation)
  // would otherwise yank the camera back and discard wherever the player
  // has since panned to.
  let hasCenteredOnce = false;
  const layout = () => {
    const toolbarHeight = document.getElementById("command-panel")?.getBoundingClientRect().height ?? 0;
    const safeAreaTop = getSafeAreaInsetTop();
    currentScale = baseScale * zoomFactor;
    renderer.view.scale.set(currentScale);
    if (!hasCenteredOnce) {
      const shrine = simulation.getShrinePosition("player");
      if (shrine) centerViewOn(shrine.x, shrine.y, safeAreaTop);
      hasCenteredOnce = true;
    }
    hud.setMaxWidth(app.screen.width);
    // Top left, opposite the population gauge — the original's own arrangement.
    minimap.view.position.set(10, 10 + safeAreaTop);
    // Clear of the world map rather than behind it. These two lines and the
    // minimap were both anchored to the same corner, so 「地形: 草原」 and
    // any 地形操作 restriction have been hidden under the rock since the map
    // moved here (plan/0130). Measured from minimapHeight rather than
    // MINIMAP_SIZE because the island is taller than the map it holds.
    hud.setTopOffset(safeAreaTop + minimapHeight(MINIMAP_SIZE) + HUD_GAP_BELOW_MINIMAP);
    populationGauge.view.position.set(app.screen.width - POPULATION_GAUGE_WIDTH - 10, 10 + safeAreaTop);
    if (tutorialHint) tutorialHint.style.bottom = `${toolbarHeight + 12}px`;
  };
  layout();
  window.addEventListener("resize", layout);

  // The 4 screen corners' current world (tile) positions — shared by
  // visibleBounds/strictVisibleBounds below. Recomputed fresh wherever
  // needed rather than cached, since pan/zoom/rotate can change between
  // any two calls.
  const screenCornersInWorldSpace = () => [
    renderer.view.toLocal({ x: 0, y: 0 }),
    renderer.view.toLocal({ x: app.screen.width, y: 0 }),
    renderer.view.toLocal({ x: app.screen.width, y: app.screen.height }),
    renderer.view.toLocal({ x: 0, y: app.screen.height }),
  ];

  // Which tiles the current camera could possibly show, in world (tile)
  // coordinates, padded by TILE_BOUNDS_MARGIN (see IsoRenderer's
  // visibleTileBounds doc comment for why redraw() wants that slack — a
  // tall raised vertex or a rock tile's lava overshoot must never pop
  // in/out right at the screen edge).
  const visibleBounds = () => visibleTileBounds(screenCornersInWorldSpace(), heightmap.width, heightmap.height);

  // Whether a tile-space point is actually being drawn on screen right
  // now — projected to the surface it stands on and tested against the
  // canvas itself, so the current pan, zoom and rotation all count.
  //
  // This used to ask visibleTileBounds instead, i.e. the axis-aligned
  // *bounding box* of the screen's four corners. In tile space the screen
  // is a long thin diamond, and its bounding box is far larger than it:
  // on the 480x900 viewport this game is built for, the box measures 36
  // tiles on each axis while the diamond it contains is only 15 tiles
  // across its narrow axis. Everything in that difference is ground the
  // player cannot see and, per the original's own rule
  // (docs/original-miracles.md's Close-Up Map — 「現在、見えている
  // クローズ・アップ・マップの範囲に」), should never have been able to
  // reach.
  // The screen's own tile bounding box, for the minimap's "you are here"
  // rectangle only — a box is the right shape for that indicator, and it
  // is no longer used to decide anything about casting (see isOnScreen).
  const strictVisibleBounds = () => visibleTileBounds(screenCornersInWorldSpace(), heightmap.width, heightmap.height, 0);

  const isOnScreen = (point: { x: number; y: number }): boolean => {
    const local = renderer.project(point.x, point.y);
    const screen = renderer.view.toGlobal({ x: local.sx, y: local.sy });
    return screen.x >= 0 && screen.x <= app.screen.width && screen.y >= 0 && screen.y <= app.screen.height;
  };

  // docs/game-system.md-inspired original-game rule: the player can only
  // act with their god-given powers while at least one of their own
  // walkers/houses/shrine is somewhere within the current camera view —
  // see plan/0063-visibility-gated-casting.md. Without this, a much
  // bigger, freely-pannable map (plan/0062-original-scale-map.md) lets a
  // single tap snipe anywhere on the map instantly, with no need to
  // actually travel there first.
  //
  // The enemy god plays by the same rule, through its own stand-in for a
  // screen — see systems/aiViewport.ts. This check stays player-only
  // because the *camera* is player-only; the reach limit behind it is
  // not, and treating "has no camera" as "needs no reach limit" is
  // exactly the bug that let the enemy strike a capital it had nobody
  // within forty tiles of.
  const isOwnFactionVisible = (): boolean => {
    const shrine = simulation.getShrinePosition("player");
    if (shrine && isOnScreen(shrine)) return true;
    for (const entity of simulation.listInspectableEntities()) {
      if (entity.faction === "player" && isOnScreen(entity.position)) return true;
    }
    return false;
  };

  // Every mana-costing action a tap can trigger goes through this instead
  // of calling trySpendMana directly — see isOwnFactionVisible above. Mana
  // is left untouched and the "照会" info panel (reused here rather
  // than adding a near-identical banner) explains why nothing happened —
  // without this, a raise/lower tap (or any miracle) with insufficient
  // mana was a silent no-op, indistinguishable from the edit just not
  // having registered at all (per feedback: "上げ下げができているのか
  // 分からない").
  /**
   * The same check without spending anything, for the miracles that have
   * to *apply themselves* to find out whether they did anything at all —
   * applyForest/applyRoad/applyWall/applyFungus each return the vertices
   * they changed, and a cast that changes nothing is refused rather than
   * charged for. Those have to ask before they act: mutating the terrain
   * and only then discovering the mana was short handed the player the
   * whole effect for free.
   */
  const canAffordPlayerMana = (cost: number): boolean => {
    if (!isOwnFactionVisible()) {
      showEntityInfo("自分の勢力が画面内に見えていません", "warning");
      return false;
    }
    const mana = simulation.getMana("player");
    if (mana >= cost) return true;
    showEntityInfo(`マナが足りません（必要 ${cost} / 現在 ${mana.toFixed(1)}）`, "warning");
    return false;
  };

  const trySpendPlayerMana = (cost: number): boolean => {
    if (!canAffordPlayerMana(cost)) return false;
    return trySpendMana(simulation.world, "player", cost);
  };

  // Nudges a first-time player toward the core loop — see Hud.ts's
  // comment on why the canvas HUD itself carries no such guidance.
  // Dismissed by the player's first terrain edit, or after a timeout for
  // anyone who's just watching instead of tapping.
  const dismissTutorialHint = () => tutorialHint?.classList.add("hidden");
  setTimeout(dismissTutorialHint, TUTORIAL_HINT_TIMEOUT_MS);

  minimap.view.eventMode = "static";
  minimap.view.cursor = "pointer";
  minimap.view.hitArea = new Rectangle(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  minimap.view.on("pointerdown", (event) => {
    // Stops this tap from also reaching the main map's own pointerdown
    // handler below (both listen on the pointer hierarchy under app.stage).
    event.stopPropagation();
    const local = minimap.view.toLocal(event.global);
    const target = minimap.toWorld(local.x, local.y);
    centerViewOn(target.x, target.y);
  });

  // Defaults to whichever direction terrainEditRule actually allows —
  // defaulting to the disabled "raise" under lowerOnly would otherwise
  // leave the player's very first tap doing nothing. Under 土地上下不可
  // there is no allowed direction at all, so it falls back to 照会, the
  // panel's own neutral "nothing is armed" tool (see ui/toolbar.ts, which
  // already disarms to 照会 when the player changes school).
  let toolMode: ToolMode = terrainEditRule === "neither" ? "inspect" : terrainEditRule === "lowerOnly" ? "lower" : "raise";

  // Finds the walker/house closest to a tapped point in renderer.view's
  // local space, for the "照会" tool — mirrors IsoRenderer.pickVertex's
  // own nearest-within-maxDistance approach (maxDistance in real screen
  // px, converted to local-space units so a finger's tap tolerance stays
  // constant regardless of the current zoom), just against entities'
  // projected screen positions instead of the vertex grid.
  const pickInspectableEntity = (localX: number, localY: number, maxDistance = 40): InspectableEntity | null => {
    const localMaxDistance = maxDistance / renderer.view.scale.x;
    let best: InspectableEntity | null = null;
    let bestDistance = localMaxDistance;

    for (const entity of simulation.listInspectableEntities()) {
      const { sx, sy } = renderer.project(entity.position.x, entity.position.y);
      const distance = Math.hypot(sx - localX, sy - localY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entity;
      }
    }

    return best;
  };

  // The elevation a "flatten" brush stroke is leveling everything toward —
  // captured from the first tile the stroke touches (see
  // applyTerrainEditAt's "flatten" branch) and reused for every tile the
  // same continuous gesture then paints over, so dragging across a bumpy
  // area levels it all to one common plateau instead of flattening each
  // tile to its own separate target. Reset to undefined between gestures —
  // see stopPainting and the pointerdown handler further down.
  let flattenTargetElevation: number | undefined;

  // "平坦化" stays tile/area-based (see flattenTile's own doc comment on
  // why leveling a plot is inherently about an area, not a point) — picks
  // via pickTile, unlike applyRaiseEditAt below.
  const applyFlattenEditAt = (tile: { x: number; y: number }): void => {
    // Some worlds forbid reshaping land inside the enemy's own territory —
    // see WorldDefinition's enemyTerritoryEditable — checked (and reported)
    // before touching flattenTargetElevation or spending any mana, same as
    // isOwnFactionVisible above. Checked first, before flattenTargetElevation
    // is computed below: an enemy-territory tile blocked here must never get
    // the chance to seed that gesture-wide cached target in the first place.
    if (!world.enemyTerritoryEditable && simulation.isEnemyTerritory("player", tile)) {
      showEntityInfo("この面では敵の陣地を直接操作できません", "warning");
      return;
    }
    if (flattenTargetElevation === undefined) {
      // The tile's own corners decide the target, biased by direction
      // when this match restricts one — per TerrainEditRule's own doc
      // comment, a restricted match must still be able to fully level an
      // ordinary tile using only its permitted direction: raiseOnly
      // levels up to the tile's own highest corner, lowerOnly down to its
      // lowest, "both" simply averages them.
      const corners = [
        heightmap.vertices[tile.y][tile.x],
        heightmap.vertices[tile.y][tile.x + 1],
        heightmap.vertices[tile.y + 1][tile.x + 1],
        heightmap.vertices[tile.y + 1][tile.x],
      ];
      flattenTargetElevation =
        terrainEditRule === "raiseOnly"
          ? Math.max(...corners)
          : terrainEditRule === "lowerOnly"
            ? Math.min(...corners)
            : corners.reduce((sum, h) => sum + h, 0) / corners.length;
    }
    if (!trySpendPlayerMana(TERRAIN_EDIT_MANA_COST)) return;
    flattenTile(heightmap, tile.x, tile.y, flattenTargetElevation, terrainEditRule);
    renderer.redraw(visibleBounds());
    dismissTutorialHint();
  };

  // Raises/lowers a single grid vertex — picked via pickVertex, not
  // pickTile. This used to edit a whole tile's 4 corners (raiseTile) at
  // once, matching plan/0065-tile-based-terraform.md's original request to
  // mirror the original game's tile-based terraforming — but every corner
  // is shared with up to 3 *other* tiles, so a single tap visibly tilted
  // every neighboring tile touching that tile's corners too, reading as
  // "tapping moves the surroundings along with it" (per feedback:
  // "操作するのは1面ずつにしてください、今はタップすると周りがまとめて
  // 動きます" — confirmed by the reporter to mean exactly this, not the
  // brush painting too wide an area). raiseTile's own rationale (raiseVertex
  // alone left the old flat-averaged-per-tile renderer with jagged block
  // boundaries — plan/0064-terraced-terrain.md) no longer applies: the
  // renderer hasn't averaged tiles into flat blocks since plan/0073's
  // per-vertex sloped mesh, so a single vertex nudge just tilts the (at
  // most 4, half of raiseTile's up-to-8) neighboring tiles smoothly, with
  // no jagged edge to speak of. "平坦化" keeps the tile-based raiseTile
  // pattern (see applyFlattenEditAt) since leveling a whole plot is
  // inherently area-shaped, unlike a plain raise/lower nudge.
  const applyRaiseEditAt = (vertex: { x: number; y: number }): void => {
    const delta = toolMode === "lower" ? -1 : 1;
    // Should be unreachable in practice — the toolbar disables whichever
    // of raise/lower this match's terrainEditRule forbids — but checked
    // here too so a stale toolMode can never spend mana for an edit that
    // silently does nothing.
    if (!isTerrainEditAllowed(terrainEditRule, delta)) return;
    // Some worlds forbid reshaping land inside the enemy's own territory —
    // see WorldDefinition's enemyTerritoryEditable — checked (and reported)
    // before spending any mana, same as isOwnFactionVisible above.
    if (!world.enemyTerritoryEditable && simulation.isEnemyTerritory("player", vertex)) {
      showEntityInfo("この面では敵の陣地を直接操作できません", "warning");
      return;
    }
    if (!trySpendPlayerMana(TERRAIN_EDIT_MANA_COST)) return;
    raiseVertex(heightmap, vertex.x, vertex.y, delta);
    renderer.redraw(visibleBounds());
    dismissTutorialHint();
  };

  /**
   * The original's 自動整地 — 「Xボタンで建物を中心に7x7マスの平地を確保」,
   * one of the two conveniences the original is praised for by name.
   *
   * Aimed at a *house*, not at the ground: the plot this levels is the one
   * a particular building sits in, which is what makes it a single press
   * rather than an accurate 49-tile drag with 平坦化. Only the player's own
   * houses — this is a shortcut for tending your own village, not a way to
   * reshape the ground under the enemy's.
   *
   * Priced at exactly what the same work costs by hand (one
   * TERRAIN_EDIT_MANA_COST per tile that actually moves), and quoted in
   * full before anything is spent, so this is an ergonomic convenience
   * rather than a discount on terraforming.
   */
  const applyAutoFlattenAt = (localX: number, localY: number): void => {
    const target = pickInspectableEntity(localX, localY);
    if (!target || target.kind !== "house" || target.faction !== "player") {
      showEntityInfo("自動整地は自分の家をタップしてください", "warning");
      return;
    }

    const { elevation, tiles } = planAutoFlatten(
      heightmap,
      target.position.x,
      target.position.y,
      terrainEditRule,
      AUTO_FLATTEN_SIZE,
      // Same restriction the manual tools honour — see applyFlattenEditAt.
      // Blocked tiles drop out of the plan, so they are neither levelled
      // nor charged for, and the rest of the plot still levels.
      (tile) => world.enemyTerritoryEditable || !simulation.isEnemyTerritory("player", tile),
    );

    if (tiles.length === 0) {
      showEntityInfo("この家の周りはすでに平地です");
      return;
    }
    if (!trySpendPlayerMana(tiles.length * TERRAIN_EDIT_MANA_COST)) return;

    for (const tile of tiles) flattenTile(heightmap, tile.x, tile.y, elevation, terrainEditRule);
    renderer.redraw(visibleBounds());
    vibrate(30);
    dismissTutorialHint();
  };

  /**
   * The original's スプログ (see game/populationRelease.ts) — 「建物の中心に
   * カーソルを合わせてBボタンを押すと、信者の一部が追い出される」.
   *
   * Aimed at one house, like 自動整地 above and for the same reason: the
   * original puts the cursor on a building. This replaced a free-standing
   * 送出 button that emptied *every* house the player owned at once — with
   * that on the panel there was never a reason to aim, so the original's
   * command could not meaningfully exist beside it.
   *
   * Free, like a behaviorMode change. Only vibrates when it actually did
   * something: a tap on a house that hasn't grown to
   * POPULATION_RELEASE_MIN_FRACTION yet is refused, and says so rather than
   * reading as a tap that failed to register.
   */
  const applySprogAt = (localX: number, localY: number): void => {
    const target = pickInspectableEntity(localX, localY);
    if (!target || target.kind !== "house" || target.faction !== "player") {
      showEntityInfo("スプログは自分の家をタップしてください", "warning");
      return;
    }
    if (!simulation.sprogHouse(target.entity)) {
      showEntityInfo("この家はまだ人を出せません", "warning");
      return;
    }
    vibrate(15);
  };

  /**
   * One 地下巨石 cast. Split out of applyTool because the original's own
   * description makes this repeatable: 「発生ボタンを押し続けると、一帯に
   * より多くの巨石を発生させる」 — see the hold handling in the pointer
   * events below, which calls this once per repeat.
   *
   * `announce` is off for the repeats: a held press that wanders onto
   * water should quietly place nothing there, not fill the info panel with
   * one warning per interval tick.
   *
   * Returns whether a stone actually went up, so a hold can stop itself
   * once the mana runs out or the whole area is already stone.
   */
  const castMegalithAt = (vertex: { x: number; y: number }, announce: boolean): boolean => {
    if (!canAffordPlayerMana(MEGALITH_MANA_COST)) return false;
    const raised = applyMegalith(heightmap, vertex.x, vertex.y);
    if (raised.length === 0) {
      if (announce) showEntityInfo("ここには巨石を起こせません", "warning");
      return false;
    }
    trySpendPlayerMana(MEGALITH_MANA_COST);
    raiseMegalith(simulation.world, raised);
    renderer.redraw(visibleBounds());
    simulation.recordEvent("player", "megalith");
    triggerShake(6);
    vibrate([30, 20, 40]);
    playMiracleSound("megalith");
    return true;
  };

  // Dispatches to whichever of the two above the current toolMode needs —
  // shared by the plain single-tap path (applyTool, below) and by ブラシ
  // continuous painting (see the pointer handlers further down).
  const applyTerrainEditAt = (point: { x: number; y: number }): void => {
    if (toolMode === "flatten") applyFlattenEditAt(point);
    else applyRaiseEditAt(point);
  };

  // The point a raise/lower/flatten tap or brush stroke should edit —
  // a vertex for raise/lower, a tile for flatten (see applyRaiseEditAt's
  // own doc comment on why they differ). Returns null for every other
  // toolMode.
  const pickTerrainEditPoint = (localX: number, localY: number): { x: number; y: number } | null => {
    if (toolMode === "flatten") return renderer.pickTile(localX, localY);
    if (toolMode === "raise" || toolMode === "lower") return renderer.pickVertex(localX, localY);
    return null;
  };

  const applyTool = (event: FederatedPointerEvent) => {
    const local = renderer.view.toLocal(event.global);

    // Should be unreachable in practice — the toolbar disables any miracle
    // this world hasn't unlocked yet (see below) — but checked here too so
    // a stale toolMode can never cast something this world forbids.
    if (!isAllowedMiracle(toolMode)) return;

    if (toolMode === "inspect") {
      const entity = pickInspectableEntity(local.x, local.y);
      if (entity) showEntityInfo(describeInspectableEntity(entity));
      return;
    }

    if (toolMode === "autoFlatten") {
      applyAutoFlattenAt(local.x, local.y);
      return;
    }

    if (toolMode === "sprog") {
      applySprogAt(local.x, local.y);
      return;
    }

    if (toolMode === "raise" || toolMode === "lower" || toolMode === "flatten") {
      const point = pickTerrainEditPoint(local.x, local.y);
      if (point) applyTerrainEditAt(point);
      return;
    }

    const vertex = renderer.pickVertex(local.x, local.y);
    if (!vertex) return;

    if (toolMode === "shrine") {
      // Checked before spending, like 岩礁's "only at sea": 「リーダーが
      // いない状態ではこのコマンドは使用できない」, and charging for a cast
      // that does nothing reads as the game being broken.
      if (!simulation.hasLeader("player")) {
        showEntityInfo("リーダーが居ないと集結地は動かせません（まず集結を）", "warning");
        return;
      }
      if (!trySpendPlayerMana(SHRINE_MOVE_MANA_COST)) return;
      simulation.moveShrine("player", vertex);
      simulation.recordEvent("player", "shrineMove");
      vibrate(15);
      playMiracleSound("shrineMove");
      return;
    }

    if (toolMode === "earthquake") {
      if (!trySpendPlayerMana(EARTHQUAKE_MANA_COST)) return;
      // The fissure runs away from the caster's own shrine, through the
      // tapped point. The original aims it with a pointer; a tap has no
      // second axis to carry a heading, and taking it from "where I am to
      // where I struck" gives one for free — and never cracks the ground
      // back toward your own settlement.
      const from = simulation.getShrinePosition("player") ?? vertex;
      applyEarthquake(heightmap, vertex.x, vertex.y, vertex.x - from.x, vertex.y - from.y);
      collapseSwampsNear(simulation.world, vertex.x, vertex.y, DEFAULT_EARTHQUAKE_RADIUS);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "earthquake");
      triggerShake(6);
      vibrate(40);
      playMiracleSound("earthquake");
      return;
    }

    if (toolMode === "swamp") {
      if (!trySpendPlayerMana(SWAMP_MANA_COST)) return;
      // 「面ごとに底なしかどうか設定される」 — the enemy god's own swamps on
      // this stage are the same kind (see Simulation's bottomlessSwamp).
      createSwamp(simulation.world, vertex.x, vertex.y, SWAMP_RADIUS, SWAMP_CAPACITY, world.bottomlessSwamp);
      simulation.recordEvent("player", "swamp");
      vibrate(25);
      playMiracleSound("swamp");
      return;
    }

    if (toolMode === "holyWater") {
      // The spring belongs to whoever cast it — walkers come out as *its*
      // owner's, which is why it is worth casting on the enemy's doorstep
      // rather than on your own ground (see systems/holyWater.ts).
      if (!trySpendPlayerMana(HOLY_WATER_MANA_COST)) return;
      createHolyWater(simulation.world, "player", vertex.x, vertex.y);
      simulation.recordEvent("player", "holyWater");
      vibrate(20);
      playMiracleSound("holyWater");
      return;
    }

    if (toolMode === "tornado") {
      if (!trySpendPlayerMana(TORNADO_MANA_COST)) return;
      // Aimed away from the caster's own shrine, exactly like an
      // earthquake's fissure: a tap carries no second axis to point with,
      // and "from where I am, through where I struck" gives one for free —
      // and never sets a wandering hazard off toward your own people.
      const from = simulation.getShrinePosition("player") ?? vertex;
      createTornado(simulation.world, vertex.x, vertex.y, vertex.x - from.x, vertex.y - from.y);
      simulation.recordEvent("player", "tornado");
      triggerShake(4);
      vibrate([20, 20, 20]);
      playMiracleSound("tornado");
      return;
    }

    if (toolMode === "lightning") {
      if (!trySpendPlayerMana(LIGHTNING_MANA_COST)) return;
      strikeLightning(simulation.world, heightmap, vertex, Math.random, (event) =>
        simulation.recordImpactEffect(event),
      );
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "lightning");
      triggerShake(6);
      vibrate([15, 40, 15]);
      playMiracleSound("lightning");
      return;
    }

    if (toolMode === "plague") {
      // Checked before spending: a plague needs someone to infect, and
      // charging for a cast on empty ground reads as the game being broken.
      if (!canAffordPlayerMana(PLAGUE_MANA_COST)) return;
      if (seedPlague(simulation.world, vertex) === 0) {
        showEntityInfo("ここには感染させる相手がいません", "warning");
        return;
      }
      trySpendPlayerMana(PLAGUE_MANA_COST);
      simulation.recordEvent("player", "plague");
      vibrate(25);
      playMiracleSound("plague");
      return;
    }

    if (toolMode === "storm") {
      if (!trySpendPlayerMana(STORM_MANA_COST)) return;
      createStorm(simulation.world, vertex.x, vertex.y);
      simulation.recordEvent("player", "storm");
      triggerShake(3);
      vibrate([20, 30, 20, 30]);
      playMiracleSound("storm");
      return;
    }

    if (toolMode === "firePillar") {
      if (!trySpendPlayerMana(FIRE_PILLAR_MANA_COST)) return;
      // Aimed like the earthquake, the tornado and the hurricane: from the
      // caster's own shrine, through the tapped point. It wanders from
      // there, so this is a push rather than a path.
      const from = simulation.getShrinePosition("player") ?? vertex;
      createFirePillar(simulation.world, vertex.x, vertex.y, vertex.x - from.x, vertex.y - from.y);
      simulation.recordEvent("player", "firePillar");
      triggerShake(4);
      vibrate([30, 15, 30]);
      playMiracleSound("firePillar");
      return;
    }

    if (toolMode === "hurricane") {
      if (!trySpendPlayerMana(HURRICANE_MANA_COST)) return;
      // Aimed like the earthquake and the tornado: from the caster's own
      // shrine, through the tapped point. Here the direction is the whole
      // miracle — it decides what the gust throws people *into*.
      const from = simulation.getShrinePosition("player") ?? vertex;
      applyHurricane(simulation.world, vertex, vertex.x - from.x, vertex.y - from.y, (event) =>
        simulation.recordImpactEffect(event),
      );
      simulation.recordEvent("player", "hurricane");
      triggerShake(5);
      vibrate([40, 20, 40]);
      playMiracleSound("hurricane");
      return;
    }

    if (toolMode === "forest") {
      // Affordability first, then whether it would do anything: a forest
      // only takes on buildable land, and charging for a cast that plants
      // nothing reads as the game being broken — but so does planting one
      // the player cannot pay for (see canAffordPlayerMana).
      if (!canAffordPlayerMana(FOREST_MANA_COST)) return;
      if (applyForest(heightmap, vertex.x, vertex.y).length === 0) {
        showEntityInfo("ここには森が育ちません", "warning");
        return;
      }
      trySpendPlayerMana(FOREST_MANA_COST);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "forest");
      vibrate(20);
      playMiracleSound("forest");
      return;
    }

    if (toolMode === "flower") {
      // Affordability first, same as the forest and the road below: the
      // flower only heals torn ground and charging for a cast that finds
      // nothing to heal reads as the game being broken — but this one both
      // reshapes terrain *and* destroys Swamp entities, so discovering the
      // mana was short afterwards would hand all of that over for free.
      // Swamps are checked too: they are ECS entities rather than terrain
      // (see swamp.ts).
      if (!canAffordPlayerMana(FLOWER_MANA_COST)) return;
      const healed = applyFlower(heightmap, vertex.x, vertex.y);
      const clearedSwamps = collapseSwampsNear(simulation.world, vertex.x, vertex.y, DEFAULT_FLOWER_RADIUS);

      if (healed.length === 0 && clearedSwamps === 0) {
        showEntityInfo("ここには癒すものがありません", "warning");
        return;
      }
      trySpendPlayerMana(FLOWER_MANA_COST);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "flower");
      vibrate(20);
      playMiracleSound("flower");
      return;
    }

    if (toolMode === "road") {
      // Same order as the forest: a road only takes on open ground, and
      // paving is refused outright on 毒カビ (see applyRoad) — the
      // interaction is that you lay a road *ahead* of an outbreak.
      if (!canAffordPlayerMana(ROAD_MANA_COST)) return;
      // 「なお、敵陣や斜面には設置できない」. The slope half lives in
      // applyRoad (isLevelVertex); territory needs the world, so it is
      // asked here — the same split the per-world terrain-edit rule uses.
      // Unlike that one this is not a per-world setting: 道 and 城壁 are
      // never laid on enemy ground in any stage.
      if (simulation.isEnemyTerritory("player", vertex)) {
        showEntityInfo("敵陣には道を敷けません", "warning");
        return;
      }
      if (applyRoad(heightmap, vertex.x, vertex.y).length === 0) {
        showEntityInfo("ここには道を敷けません", "warning");
        return;
      }
      trySpendPlayerMana(ROAD_MANA_COST);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "road");
      vibrate(20);
      playMiracleSound("road");
      return;
    }

    if (toolMode === "wall") {
      // Same order as the road: pay only once the stone actually goes up,
      // and refuse the cast outright where a wall cannot stand (water, a
      // crevice, 毒カビ, or ground already walled — see applyWall).
      if (!canAffordPlayerMana(WALL_MANA_COST)) return;
      // 「道と同じく、敵陣や斜面には設置できない」 — see the road above.
      if (simulation.isEnemyTerritory("player", vertex)) {
        showEntityInfo("敵陣には城壁を築けません", "warning");
        return;
      }
      if (applyWall(heightmap, vertex.x, vertex.y).length === 0) {
        showEntityInfo("ここには城壁を築けません", "warning");
        return;
      }
      trySpendPlayerMana(WALL_MANA_COST);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "wall");
      vibrate(20);
      playMiracleSound("wall");
      return;
    }

    if (toolMode === "megalith") {
      // Pay only once the stone is actually up, same as the wall — and a
      // cast on water or a crevice raises nothing (see applyMegalith).
      if (!castMegalithAt(vertex, true)) return;
      return;
    }

    if (toolMode === "fungus") {
      // Nothing takes root on water, rock, a crevice or a road.
      if (!canAffordPlayerMana(FUNGUS_MANA_COST)) return;
      if (applyFungus(heightmap, vertex.x, vertex.y).length === 0) {
        showEntityInfo("ここには毒カビが根付きません", "warning");
        return;
      }
      trySpendPlayerMana(FUNGUS_MANA_COST);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "fungus");
      vibrate(25);
      playMiracleSound("fungus");
      return;
    }

    if (toolMode === "fireRain") {
      if (!trySpendPlayerMana(FIRE_RAIN_MANA_COST)) return;
      burnFire(simulation.world, applyFireRain(heightmap, vertex.x, vertex.y), (event) =>
        simulation.recordImpactEffect(event),
      );
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "fireRain");
      triggerShake(4);
      vibrate([30, 20, 30]);
      playMiracleSound("fireRain");
      return;
    }

    if (toolMode === "volcano") {
      if (!trySpendPlayerMana(VOLCANO_MANA_COST)) return;
      eruptVolcano(simulation.world, applyVolcano(heightmap, vertex.x, vertex.y));
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "volcano");
      triggerShake(8);
      vibrate([40, 30, 60]);
      playMiracleSound("volcano");
      return;
    }

    // Every hero miracle is the same action with a different name — a
    // global effect on the leader, not on the tapped spot — so they share
    // one branch rather than five copies. Which hero the player actually
    // gets is entirely HERO_TRAITS plus the systems that own each rule
    // (see game/hero.ts).
    const heroCost = HERO_MANA_COST[toolMode as HeroKind];
    if (heroCost !== undefined) {
      const kind = toolMode as HeroKind;
      if (!trySpendPlayerMana(heroCost)) return;
      simulation.promoteHero("player", kind);
      simulation.recordEvent("player", kind);
      vibrate(kind === "guardian" ? 25 : 30);
      playMiracleSound(kind);
      return;
    }

    if (toolMode === "armageddon") {
      // Global effect on both factions at once, unlike every other miracle.
      if (!trySpendPlayerMana(ARMAGEDDON_MANA_COST)) return;
      simulation.triggerArmageddon();
      simulation.recordEvent("player", "armageddon");
      triggerShake(10);
      vibrate([60, 40, 60, 40, 100]);
      playMiracleSound("armageddon");
      return;
    }

    if (toolMode === "reef") {
      // Checked before spending: a reef only means anything at sea, and
      // charging for a cast that does nothing is the kind of thing that
      // reads as the game being broken.
      if (sampleElevation(heightmap, vertex.x, vertex.y) > heightmap.waterLevel) {
        showEntityInfo("岩礁は海にしか作れません", "warning");
        return;
      }
      if (!trySpendPlayerMana(REEF_MANA_COST)) return;
      // One cast lays a whole breakwater — a line parallel to the coast,
      // per the original's 「線分状に発生させる」. See applyReef.
      applyReef(heightmap, vertex.x, vertex.y);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "reef");
      vibrate(30);
      playMiracleSound("reef");
      return;
    }

    if (toolMode === "whirlpool") {
      // 「渦巻き：海面上をランダムに動き回り、既にある土地を削り取る」 — it
      // lives on water and nowhere else, so the same up-front check 岩礁
      // uses: charging for a cast that does nothing reads as the game being
      // broken.
      if (sampleElevation(heightmap, vertex.x, vertex.y) > heightmap.waterLevel) {
        showEntityInfo("渦巻きは海にしか作れません", "warning");
        return;
      }
      if (!trySpendPlayerMana(WHIRLPOOL_MANA_COST)) return;
      // Headed away from the caster's own shrine, like the 竜巻 that can
      // also produce one: the only thing a whirlpool does is take land
      // away, and a tap carries no second axis to aim it with.
      const from = simulation.getShrinePosition("player") ?? vertex;
      createWhirlpool(simulation.world, vertex.x, vertex.y, vertex.x - from.x, vertex.y - from.y);
      simulation.recordEvent("player", "whirlpool");
      vibrate(30);
      playMiracleSound("whirlpool");
      return;
    }

    if (toolMode === "tsunami") {
      // Aimed, unlike the global sea-level rise this replaced: the tap is
      // the wave's origin, and high ground or a reef between it and a
      // settlement genuinely shelters that settlement (see applyTsunami).
      if (!trySpendPlayerMana(TSUNAMI_MANA_COST)) return;
      applyTsunami(heightmap, vertex.x, vertex.y);
      drownFlood(simulation.world, heightmap, (event) => simulation.recordImpactEffect(event));
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "tsunami");
      triggerShake(5);
      vibrate(50);
      playMiracleSound("tsunami");
      return;
    }
  };

  // A short tap applies the selected tool; dragging beyond DRAG_THRESHOLD
  // pans the camera instead. Distinguishing the two is what lets a
  // one-finger touchscreen do both without a dedicated "pan mode" toggle.
  let pointerActive = false;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let viewStartPos = { x: 0, y: 0 };

  // "ブラシ" continuous terraforming (see plan/0054-terraform-brush.md):
  // holding a single press still for LONG_PRESS_DURATION_MS — long enough
  // that it hasn't already turned into a pan — engages painting, so every
  // tile the pointer then passes over gets edited once. Leveling a wide
  // area becomes one smooth gesture instead of many precise individual
  // taps. Restricted to the "raise"/"lower"/"flatten" tools (checked at
  // each call site below): every other toolMode is a single deliberate,
  // often expensive miracle cast that a drag should never be able to repeat.
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let painting = false;
  /**
   * The one miracle a held press repeats: 地下巨石. 「発生ボタンを押し続けると、
   * 一帯により多くの巨石を発生させる」 — see castMegalithAt and
   * megalithScatterCandidates. Every other miracle stays a single
   * deliberate cast, which is why this is its own flag rather than another
   * toolMode in the brush's list: the brush edits whatever the pointer
   * moves over, while this stays put and scatters around where it was
   * first pressed.
   */
  let megalithHoldTimer: ReturnType<typeof setInterval> | undefined;
  let megalithHolding = false;
  // A vertex for raise/lower, a tile for flatten — see pickTerrainEditPoint.
  let lastPaintedPoint: { x: number; y: number } | undefined;

  const clearLongPressTimer = () => {
    if (longPressTimer === undefined) return;
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  };

  const stopMegalithHold = () => {
    if (megalithHoldTimer !== undefined) clearInterval(megalithHoldTimer);
    megalithHoldTimer = undefined;
    megalithHolding = false;
  };

  const stopPainting = () => {
    clearLongPressTimer();
    stopMegalithHold();
    painting = false;
    lastPaintedPoint = undefined;
    flattenTargetElevation = undefined;
  };

  // A second finger switches to rotating/pinch-zooming the map instead of
  // panning/tapping. Tracked by pointerId (not just a count) since PixiJS's
  // multi-touch events distinguish fingers that way.
  const activePointers = new Map<number, { x: number; y: number }>();
  let rotating = false;
  let lastTwoFingerAngle = 0;
  let lastTwoFingerDistance = 0;
  // Set for the whole gesture (first finger down to last finger up) once
  // a second finger joins, so lifting back to one finger doesn't fire a
  // tap and releasing the last finger doesn't resume panning.
  let gestureHadTwoFingers = false;

  const twoFingerAngle = (points: { x: number; y: number }[]): number => {
    const [a, b] = points;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  const twoFingerDistance = (points: { x: number; y: number }[]): number => {
    const [a, b] = points;
    return Math.hypot(b.x - a.x, b.y - a.y);
  };

  // Rotates renderer.view by deltaAngle and scales it by scaleRatio at once
  // (a two-finger touch naturally twists and pinches together), while
  // keeping the point currently under screen position `pivot` visually
  // fixed in place — the standard map-app "twist and pinch" feel, anchored
  // on the midpoint between the two fingers rather than the map's corner.
  // Runs the result through clampPan same as single-finger panning does,
  // so pinching in near an edge (or zooming in generally) can't drag the
  // map far enough off-screen to strand the player — clampPan doesn't
  // account for the map's current rotation either way, but that's the
  // same approximation single-finger pan already lives with post-rotate.
  const applyPinchTransform = (pivot: { x: number; y: number }, deltaAngle: number, scaleRatio: number) => {
    const local = renderer.view.toLocal(pivot);
    renderer.view.rotation += deltaAngle;
    zoomFactor = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomFactor * scaleRatio));
    currentScale = baseScale * zoomFactor;
    renderer.view.scale.set(currentScale);
    const cos = Math.cos(renderer.view.rotation);
    const sin = Math.sin(renderer.view.rotation);
    const scaledX = local.x * currentScale;
    const scaledY = local.y * currentScale;
    const next = clampPan(pivot.x - (scaledX * cos - scaledY * sin), pivot.y - (scaledX * sin + scaledY * cos));
    renderer.view.position.set(next.x, next.y);
  };

  // PC support: a mouse has no second finger for the pinch/twist gesture
  // above, so it gets its own inputs that drive the same applyPinchTransform
  // — see plan/0039-pc-support.md. Pan and tap-to-apply-tool already work
  // unmodified, since a mouse fires the same pointerdown/move/up events a
  // single touch does.
  app.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const scaleRatio = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
      applyPinchTransform({ x: event.clientX, y: event.clientY }, 0, scaleRatio);
    },
    { passive: false },
  );

  window.addEventListener("keydown", (event) => {
    if (event.key !== "q" && event.key !== "Q" && event.key !== "e" && event.key !== "E") return;
    const direction = event.key.toLowerCase() === "q" ? -1 : 1;
    const pivot = { x: app.screen.width / 2, y: app.screen.height / 2 };
    applyPinchTransform(pivot, KEY_ROTATE_STEP * direction, 1);
  });

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  app.stage.on("pointerdown", (event) => {
    activePointers.set(event.pointerId, { x: event.global.x, y: event.global.y });

    if (activePointers.size === 2) {
      gestureHadTwoFingers = true;
      rotating = true;
      pointerActive = false;
      isDragging = false;
      stopPainting();
      const points = [...activePointers.values()];
      lastTwoFingerAngle = twoFingerAngle(points);
      lastTwoFingerDistance = twoFingerDistance(points);
      return;
    }

    if (activePointers.size === 1) {
      gestureHadTwoFingers = false;
      pointerActive = true;
      isDragging = false;
      dragStart = { x: event.global.x, y: event.global.y };
      viewStartPos = { x: renderer.view.position.x, y: renderer.view.position.y };
      flattenTargetElevation = undefined; // fresh gesture — see its own doc comment

      if (toolMode === "raise" || toolMode === "lower" || toolMode === "flatten" || toolMode === "megalith") {
        clearLongPressTimer();
        longPressTimer = setTimeout(() => {
          longPressTimer = undefined;
          if (!pointerActive || isDragging || activePointers.size !== 1) return;
          const local = renderer.view.toLocal(event.global);

          if (toolMode === "megalith") {
            const center = renderer.pickVertex(local.x, local.y);
            if (!center) return;
            megalithHolding = true;
            vibrate(10); // brief confirmation that the hold just engaged
            // The first stone lands here, exactly where a plain tap would
            // have put it — holding adds to that cast rather than
            // replacing it.
            if (!castMegalithAt(center, true)) {
              stopMegalithHold();
              return;
            }
            megalithHoldTimer = setInterval(() => {
              const candidates = megalithScatterCandidates(heightmap, center.x, center.y);
              if (candidates.length === 0) {
                stopMegalithHold();
                return;
              }
              const next = candidates[Math.floor(Math.random() * candidates.length)];
              if (!castMegalithAt(next, false)) stopMegalithHold();
            }, MEGALITH_HOLD_INTERVAL_MS);
            return;
          }

          painting = true;
          vibrate(10); // brief confirmation that painting just engaged
          const point = pickTerrainEditPoint(local.x, local.y);
          if (point) {
            applyTerrainEditAt(point);
            lastPaintedPoint = point;
          }
        }, LONG_PRESS_DURATION_MS);
      }
    }
  });

  app.stage.on("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.global.x, y: event.global.y });
    }

    if (rotating && activePointers.size === 2) {
      const points = [...activePointers.values()];
      const angle = twoFingerAngle(points);
      let delta = angle - lastTwoFingerAngle;
      if (delta > Math.PI) delta -= Math.PI * 2; // shortest way around, not through the ±180° seam
      if (delta < -Math.PI) delta += Math.PI * 2;
      const distance = twoFingerDistance(points);
      const scaleRatio = lastTwoFingerDistance > 0 ? distance / lastTwoFingerDistance : 1;
      const pivot = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      applyPinchTransform(pivot, delta, scaleRatio);
      lastTwoFingerAngle = angle;
      lastTwoFingerDistance = distance;
      return;
    }

    if (!pointerActive) return;

    // A held 地下巨石 scatters around where it was pressed, so the pointer
    // drifting is not a brush stroke — it just ends the hold, the same way
    // moving before the hold engaged turns the gesture into a pan.
    if (megalithHolding) {
      const dx = event.global.x - dragStart.x;
      const dy = event.global.y - dragStart.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) stopMegalithHold();
      return;
    }

    if (painting) {
      const local = renderer.view.toLocal(event.global);
      const point = pickTerrainEditPoint(local.x, local.y);
      // Only edits when the pointer has moved onto a *different* point
      // than the last one painted this stroke — otherwise holding still
      // would keep re-editing (and re-charging mana for) the same spot
      // every single pointermove event.
      if (point && (!lastPaintedPoint || point.x !== lastPaintedPoint.x || point.y !== lastPaintedPoint.y)) {
        applyTerrainEditAt(point);
        lastPaintedPoint = point;
      }
      return;
    }

    const dx = event.global.x - dragStart.x;
    const dy = event.global.y - dragStart.y;
    if (!isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      isDragging = true;
      clearLongPressTimer(); // this turned into a pan before painting engaged
    }
    if (isDragging) {
      const next = clampPan(viewStartPos.x + dx, viewStartPos.y + dy);
      renderer.view.position.set(next.x, next.y);
    }
  });

  app.stage.on("pointerup", (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) rotating = false;

    if (pointerActive && !isDragging && !painting && !megalithHolding && !gestureHadTwoFingers) applyTool(event);

    stopPainting();
    pointerActive = false;
    isDragging = false;
    if (activePointers.size === 0) gestureHadTwoFingers = false;
  });
  app.stage.on("pointerupoutside", (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) rotating = false;

    stopPainting();
    pointerActive = false;
    isDragging = false;
    if (activePointers.size === 0) gestureHadTwoFingers = false;
  });

  wireToolbar({
    onBehaviorMode: (mode) => simulation.setBehaviorMode("player", mode),
    onToolMode: (mode) => {
      toolMode = mode;
    },
  });

  // Reflects terrainEditRule in the toolbar itself: a player should never
  // be able to select the forbidden direction in the first place, rather
  // than tapping it and having nothing happen.
  // Under 土地上下不可 that is every terrain tool there is: 平坦化 and
  // 自動整地 are made of the same vertex edits (flattenTile), so leaving
  // them enabled would offer two buttons that spend a tap and do nothing.
  const forbiddenTools: ToolMode[] =
    terrainEditRule === "neither"
      ? ["raise", "lower", "flatten", "autoFlatten"]
      : terrainEditRule === "raiseOnly"
        ? ["lower"]
        : terrainEditRule === "lowerOnly"
          ? ["raise"]
          : [];
  for (const forbidden of forbiddenTools) {
    document.querySelector<HTMLButtonElement>(`#toolbar [data-tool="${forbidden}"]`)?.setAttribute("disabled", "true");
  }
  // Same idea for allowedMiracles: a player should never be able to select
  // a miracle this world hasn't unlocked yet, rather than tapping it and
  // having nothing happen.
  for (const miracle of ALL_MIRACLES) {
    if (world.allowedMiracles.includes(miracle)) continue;
    document.querySelector<HTMLButtonElement>(`#toolbar [data-tool="${miracle}"]`)?.setAttribute("disabled", "true");
  }
  // Syncs the toolbar's visual "pressed" state with toolMode's actual
  // default set above — index.html hardcodes "raise" as pressed, which is
  // wrong whenever terrainEditRule forced the default to "lower" instead.
  document
    .querySelectorAll<HTMLButtonElement>('#toolbar [data-tool="raise"], #toolbar [data-tool="lower"], #toolbar [data-tool="inspect"]')
    .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tool === toolMode)));

  // Every tool that spends the player's mana, and how much — used below to
  // dim a button the player can't currently afford, at a glance, rather
  // than relying purely on the "マナが足りません" message a failed tap
  // shows (per feedback: "上げ下げができているのか分からない"). "raise"/
  // "lower" share TERRAIN_EDIT_MANA_COST despite being 2 separate buttons.
  // Omits "shrine"/"inspect", which spend no mana or (shrine) aren't
  // ToolMode-costed the same way — see toolbar.ts's ToolMode union.
  const MANA_COST_BY_TOOL: Partial<Record<ToolMode, number>> = {
    raise: TERRAIN_EDIT_MANA_COST,
    lower: TERRAIN_EDIT_MANA_COST,
    shrine: SHRINE_MOVE_MANA_COST,
    earthquake: EARTHQUAKE_MANA_COST,
    swamp: SWAMP_MANA_COST,
    holyWater: HOLY_WATER_MANA_COST,
    tornado: TORNADO_MANA_COST,
    whirlpool: WHIRLPOOL_MANA_COST,
    firePillar: FIRE_PILLAR_MANA_COST,
    lightning: LIGHTNING_MANA_COST,
    storm: STORM_MANA_COST,
    plague: PLAGUE_MANA_COST,
    hurricane: HURRICANE_MANA_COST,
    ...HERO_MANA_COST,
    volcano: VOLCANO_MANA_COST,
    forest: FOREST_MANA_COST,
    flower: FLOWER_MANA_COST,
    road: ROAD_MANA_COST,
    wall: WALL_MANA_COST,
    megalith: MEGALITH_MANA_COST,
    fungus: FUNGUS_MANA_COST,
    fireRain: FIRE_RAIN_MANA_COST,
    reef: REEF_MANA_COST,
    tsunami: TSUNAMI_MANA_COST,
    armageddon: ARMAGEDDON_MANA_COST,
  };
  const toolButtonsByCost = Object.entries(MANA_COST_BY_TOOL).map(([tool, cost]) => ({
    cost: cost!,
    button: document.querySelector<HTMLButtonElement>(`#toolbar [data-tool="${tool}"]`),
  }));

  // Dims (but doesn't disable — a tap still gives the clearer "マナが
  // 足りません" message above, and raise/lower must stay selectable even
  // while unaffordable so mana regenerating mid-selection doesn't require
  // re-picking the tool) any button whose cost currently exceeds the
  // player's mana. A separate CSS class from `disabled` (used for
  // terrainEditRule/allowedMiracles above) since those are permanent for
  // the match, while this changes every frame as mana rises and falls.
  const updateToolbarAffordability = () => {
    const mana = simulation.getMana("player");
    for (const { cost, button } of toolButtonsByCost) {
      button?.classList.toggle("mana-low", mana < cost);
    }
  };

  // Which bounds renderer.redraw() last actually ran with — see the ticker
  // below's skip-if-nothing-would-look-different check.
  let lastRedrawnBounds: TileBounds | undefined;
  const boundsEqual = (a: TileBounds, b: TileBounds) =>
    a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;

  app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaMS / 1000;
    simulation.update(deltaSeconds);
    // Eases the on-screen terrain toward its real (instantly-updated)
    // height — see IsoRenderer.update's doc comment — so raise/lower and
    // the various terrain miracles visibly rise or fall instead of
    // snapping. The enemy also edits the terrain now (see
    // enemyTerraform.ts and enemyMiracles.ts's earthquake), not just the
    // player's own taps — without redrawing every tick, those changes
    // were invisible until the player's next tap happened to trigger one.
    renderer.update(deltaSeconds);
    const bounds = visibleBounds();
    // Rebuilding the whole terrain mesh (redraw()) — recomputing every
    // tile's screen-space quad, its rock/lava state, etc. — is real CPU
    // work that scales with tile count, which now (see
    // plan/0062-original-scale-map.md) means up to a screen's worth of a
    // 64x64 world instead of a whole ≤32x32 one. Most frames, with the
    // camera held still and no edit in progress, that work would rebuild
    // the exact same mesh already on screen. Skipping it whenever the
    // visible bounds haven't moved and nothing's still animating (see
    // IsoRenderer.isAnimating) avoids that redundant CPU cost without ever
    // skipping a frame that would actually look different.
    // consumeTerrainChanged() covers terrain that changes with no camera
    // movement and no elevation animation to notice — 毒カビ's own growth.
    const terrainChanged = simulation.consumeTerrainChanged();
    if (!lastRedrawnBounds || !boundsEqual(bounds, lastRedrawnBounds) || renderer.isAnimating(bounds) || terrainChanged) {
      renderer.redraw(bounds);
      lastRedrawnBounds = bounds;
    }
    entityLayer.update(simulation.world, deltaSeconds, simulation.getImpactEffects());
    const outcome = simulation.getOutcome();
    hud.update();
    const summaries = simulation.summarize();
    statusPanel.update(summaries);
    const playerPopulation = summaries.find((f) => f.id === "player")?.population ?? 0;
    const enemyPopulation = summaries.find((f) => f.id === "enemy")?.population ?? 0;
    const totalPopulation = playerPopulation + enemyPopulation;
    populationGauge.update(totalPopulation > 0 ? playerPopulation / totalPopulation : 0.5);
    updateToolbarAffordability();
    if (outcome.over && !matchRecordShown) {
      matchRecordShown = true;
      showMatchRecord(outcome, simulation.getMatchEvents());
    }
    minimap.redrawTerrain();
    minimap.update(simulation.world, strictVisibleBounds());

    if (shakeTimeRemaining > 0) {
      shakeTimeRemaining = Math.max(0, shakeTimeRemaining - deltaSeconds);
      const strength = (shakeTimeRemaining / SHAKE_DURATION) * shakeMagnitude;
      worldContainer.position.set((Math.random() * 2 - 1) * strength, (Math.random() * 2 - 1) * strength);
    } else if (worldContainer.position.x !== 0 || worldContainer.position.y !== 0) {
      worldContainer.position.set(0, 0);
    }
  });
}

/**
 * 征服モードの入り口（docs/game-system.md 10節）: プレイヤーがワールドを
 * 選ぶまで試合は始まらない。#play-again が window.location.reload() で
 * ページごと作り直す都合上（plan/0038-play-again.md）、この画面も
 * 毎回ここから素通しで出し直せばよく、選択状態を別途持ち回る必要はない。
 *
 * 起動直後は最初のワールドしか選べない — worlds.ts の nextWorldId /
 * unlockedCountForPassword の doc comment の通り、この解禁状態は
 * わざと永続化しない（localStorageなど不使用）。ページを再読み込みする
 * たびに、前回クリアした際に表示されたパスワードを改めて打ち込む必要が
 * ある、昔ながらの「紙に書き写すパスワード」の体験をそのまま再現する。
 */
function showWorldSelect(): void {
  const panel = document.getElementById("world-select");
  const list = document.getElementById("world-select-list");
  const passwordInput = document.getElementById("world-select-password") as HTMLInputElement | null;
  const passwordSubmit = document.getElementById("world-select-password-submit");
  const passwordError = document.getElementById("world-select-password-error");
  if (!panel || !list) return;

  let unlockedCount = 1;

  const renderList = () => {
    list.replaceChildren(
      ...WORLDS.map((world, index) => {
        const locked = index >= unlockedCount;
        const button = document.createElement("button");
        button.type = "button";
        button.disabled = locked;

        const name = document.createElement("span");
        name.className = "world-select-name";
        name.textContent = world.name;

        const detail = document.createElement("span");
        detail.className = "world-select-detail";
        const ruleLabel = world.terrainEditRule !== "both" ? `・${TERRAIN_EDIT_RULE_LABELS[world.terrainEditRule]}` : "";
        // Only called out when it deviates from "balanced" — like ruleLabel
        // above, a personality that matches today's original, unbiased
        // thresholds isn't worth a label of its own (see EnemyPersonality's
        // doc comment in game/worlds.ts).
        const personalityLabel =
          world.enemyPersonality !== "balanced" ? `・敵の気質: ${ENEMY_PERSONALITY_LABELS[world.enemyPersonality]}` : "";
        // Always shown, unlike the two labels above: every god has a
        // school and it decides what the player will be hit with all
        // match (see game/miracleSchools.ts), so there is no "default"
        // worth leaving unsaid.
        const schoolLabel = `・敵の系統: ${MIRACLE_SCHOOLS.find(({ id }) => id === world.enemySchool)!.label}`;
        // WORLDS is itself ordered by difficulty (see its own doc comment),
        // so the world's own position in the list doubles as a simple
        // difficulty indicator — no separate derived score needed. Map
        // size is no longer shown here since every world is the same
        // fixed 64x64 (see plan/0062-original-scale-map.md).
        detail.textContent = locked
          ? "パスワードが必要です"
          : `${TERRAIN_LABELS[world.terrain]}${ruleLabel}${personalityLabel}${schoolLabel}・難易度${index + 1}/${WORLDS.length}`;

        button.append(name, detail);
        if (!locked) {
          button.addEventListener("click", () => {
            panel.classList.add("hidden");
            bootstrap(world);
          });
        }
        return button;
      }),
    );
  };
  renderList();

  passwordSubmit?.addEventListener("click", () => {
    if (!passwordInput) return;
    const count = unlockedCountForPassword(passwordInput.value.trim());
    if (count === undefined) {
      passwordError?.classList.remove("hidden");
      return;
    }
    unlockedCount = Math.max(unlockedCount, count);
    passwordInput.value = "";
    passwordError?.classList.add("hidden");
    renderList();
  });
}

showWorldSelect();
