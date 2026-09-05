import { Application, Container, Rectangle, type FederatedPointerEvent } from "pixi.js";
import { playMiracleSound } from "./audio/miracleSounds";
import {
  ARMAGEDDON_MANA_COST,
  EARTHQUAKE_MANA_COST,
  ENEMY_PERSONALITY_LABELS,
  FLOOD_MANA_COST,
  GUARDIAN_MANA_COST,
  KNIGHT_MANA_COST,
  MAX_MANA,
  SHRINE_MOVE_MANA_COST,
  SWAMP_MANA_COST,
  TERRAIN_EDIT_MANA_COST,
  TERRAIN_EDIT_RULE_LABELS,
  TERRAIN_LABELS,
  VOLCANO_MANA_COST,
} from "./game/constants";
import type { EnemyMiracleEvent } from "./game/systems/enemyMiracles";
import { trySpendMana } from "./game/faction";
import { drownFlood } from "./game/flood";
import { Simulation, type GameOutcome, type InspectableEntity, type MatchEvent } from "./game/simulation";
import { collapseSwampsNear, createSwamp } from "./game/swamp";
import { eruptVolcano } from "./game/volcano";
import { ALL_MIRACLES, WORLDS, nextWorldId, unlockedCountForPassword, type MiracleId, type WorldDefinition } from "./game/worlds";
import { EntityLayer } from "./render/EntityLayer";
import { describeInspectableEntity } from "./render/entityInfoLabel";
import { Hud } from "./render/Hud";
import { IsoRenderer, isWithinTileBounds, visibleTileBounds, type TileBounds } from "./render/IsoRenderer";
import { describeMatchEvent, formatMatchTime } from "./render/matchEventLabels";
import { Minimap } from "./render/Minimap";
import { mountCommandIcons } from "./ui/commandIcons";
import { StatusPanel } from "./ui/statusPanel";
import { wireToolbar, type ToolMode } from "./ui/toolbar";
import { DEFAULT_EARTHQUAKE_RADIUS, DEFAULT_VOLCANO_RADIUS, applyEarthquake, applyFlood, applyVolcano, createHeightmap, flattenTile, isTerrainEditAllowed, raiseVertex } from "./world/heightmap";

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
    background: "#0a1a2a",
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

  const entityLayer = new EntityLayer(renderer);
  renderer.view.addChild(entityLayer.view);

  const hud = new Hud();
  hud.setTerrain(TERRAIN_LABELS[heightmap.terrain]);
  if (terrainEditRule !== "both") hud.setTerrainEditRule(TERRAIN_EDIT_RULE_LABELS[terrainEditRule]);
  app.stage.addChild(hud.view);

  const minimap = new Minimap(heightmap, MINIMAP_SIZE);
  app.stage.addChild(minimap.view);

  mountCommandIcons();
  const statusPanel = new StatusPanel(MAX_MANA);

  // The command panel's single message line (see index.html's
  // #panel-message) — replaces the old floating pill toasts
  // (#enemy-event-toast/#entity-info-panel) per plan/0084-original-ui-
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
  // of the same miracles (knight/guardian have no player-side shake to
  // match, so keep their own small, hero-scale values).
  const ENEMY_SHAKE_MAGNITUDE: Record<EnemyMiracleEvent["type"], number> = {
    armageddon: 10,
    volcano: 8,
    earthquake: 6,
    knight: 3,
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
    instantDrowning: world.instantDrowning,
    onEnemyAction,
  });

  // The "人口放出" action (see game/populationRelease.ts) — free and
  // instant like a behaviorMode change, so it's a plain button rather than
  // a ToolMode requiring a follow-up map tap. Only vibrates when it
  // actually did something, since a tap while no house has grown enough
  // yet is a silent no-op.
  const releasePopulationButton = document.getElementById("release-population");
  releasePopulationButton?.addEventListener("click", () => {
    if (simulation.releasePopulation("player") > 0) vibrate(15);
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
    hud.setTopInset(safeAreaTop);
    minimap.view.position.set(app.screen.width - MINIMAP_SIZE - 10, 10 + safeAreaTop);
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

  // The same rectangle with no padding — see isOwnFactionVisible below,
  // the one caller. Reusing visibleBounds()'s own padded result there let
  // a faction sitting up to a dozen tiles outside the real screen still
  // count as "visible", making the "must actually see your own base" rule
  // nearly toothless (per feedback: "自勢力が映っていないと奇跡を発動
  // できない制約が崩れています"). That gameplay rule needs the actual
  // screen rectangle, not redraw()'s deliberately padded one.
  const strictVisibleBounds = () => visibleTileBounds(screenCornersInWorldSpace(), heightmap.width, heightmap.height, 0);

  // docs/game-system.md-inspired original-game rule: the player can only
  // act with their god-given powers while at least one of their own
  // walkers/houses/shrine is somewhere within the current camera view —
  // see plan/0063-visibility-gated-casting.md. Without this, a much
  // bigger, freely-pannable map (plan/0062-original-scale-map.md) lets a
  // single tap snipe anywhere on the map instantly, with no need to
  // actually travel there first. The enemy AI is exempt — it has no
  // "camera" to speak of, so this only ever constrains the human player.
  const isOwnFactionVisible = (): boolean => {
    const bounds = strictVisibleBounds();
    const shrine = simulation.getShrinePosition("player");
    if (shrine && isWithinTileBounds(shrine, bounds)) return true;
    for (const entity of simulation.listInspectableEntities()) {
      if (entity.faction === "player" && isWithinTileBounds(entity.position, bounds)) return true;
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
  const trySpendPlayerMana = (cost: number): boolean => {
    if (!isOwnFactionVisible()) {
      showEntityInfo("自分の勢力が画面内に見えていません", "warning");
      return false;
    }
    if (trySpendMana(simulation.world, "player", cost)) return true;
    showEntityInfo(`マナが足りません（必要 ${cost} / 現在 ${simulation.getMana("player").toFixed(1)}）`, "warning");
    return false;
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
  // leave the player's very first tap doing nothing.
  let toolMode: ToolMode = terrainEditRule === "lowerOnly" ? "lower" : "raise";

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

    if (toolMode === "raise" || toolMode === "lower" || toolMode === "flatten") {
      const point = pickTerrainEditPoint(local.x, local.y);
      if (point) applyTerrainEditAt(point);
      return;
    }

    const vertex = renderer.pickVertex(local.x, local.y);
    if (!vertex) return;

    if (toolMode === "shrine") {
      if (!trySpendPlayerMana(SHRINE_MOVE_MANA_COST)) return;
      simulation.moveShrine("player", vertex);
      simulation.recordEvent("player", "shrineMove");
      vibrate(15);
      playMiracleSound("shrineMove");
      return;
    }

    if (toolMode === "earthquake") {
      if (!trySpendPlayerMana(EARTHQUAKE_MANA_COST)) return;
      applyEarthquake(heightmap, vertex.x, vertex.y);
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
      createSwamp(simulation.world, vertex.x, vertex.y);
      simulation.recordEvent("player", "swamp");
      vibrate(25);
      playMiracleSound("swamp");
      return;
    }

    if (toolMode === "volcano") {
      if (!trySpendPlayerMana(VOLCANO_MANA_COST)) return;
      applyVolcano(heightmap, vertex.x, vertex.y);
      eruptVolcano(simulation.world, vertex.x, vertex.y, DEFAULT_VOLCANO_RADIUS);
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "volcano");
      triggerShake(8);
      vibrate([40, 30, 60]);
      playMiracleSound("volcano");
      return;
    }

    if (toolMode === "knight") {
      // Also a global effect (it acts on the leader, not the tapped spot).
      if (!trySpendPlayerMana(KNIGHT_MANA_COST)) return;
      simulation.knightify("player");
      simulation.recordEvent("player", "knight");
      vibrate(30);
      playMiracleSound("knight");
      return;
    }

    if (toolMode === "guardian") {
      // Also a global effect (it acts on the leader, not the tapped spot).
      if (!trySpendPlayerMana(GUARDIAN_MANA_COST)) return;
      simulation.guardianify("player");
      simulation.recordEvent("player", "guardian");
      vibrate(25);
      playMiracleSound("guardian");
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

    if (toolMode === "flood") {
      // Global effect — the tap only confirms the cast, its position doesn't matter.
      if (!trySpendPlayerMana(FLOOD_MANA_COST)) return;
      applyFlood(heightmap);
      drownFlood(simulation.world, heightmap, (event) => simulation.recordImpactEffect(event));
      renderer.redraw(visibleBounds());
      simulation.recordEvent("player", "flood");
      triggerShake(5);
      vibrate(50);
      playMiracleSound("flood");
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
  // A vertex for raise/lower, a tile for flatten — see pickTerrainEditPoint.
  let lastPaintedPoint: { x: number; y: number } | undefined;

  const clearLongPressTimer = () => {
    if (longPressTimer === undefined) return;
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  };

  const stopPainting = () => {
    clearLongPressTimer();
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

      if (toolMode === "raise" || toolMode === "lower" || toolMode === "flatten") {
        clearLongPressTimer();
        longPressTimer = setTimeout(() => {
          longPressTimer = undefined;
          if (!pointerActive || isDragging || activePointers.size !== 1) return;
          painting = true;
          vibrate(10); // brief confirmation that painting just engaged
          const local = renderer.view.toLocal(event.global);
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

    if (pointerActive && !isDragging && !painting && !gestureHadTwoFingers) applyTool(event);

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
  if (terrainEditRule !== "both") {
    const forbidden: ToolMode = terrainEditRule === "raiseOnly" ? "lower" : "raise";
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
    .querySelectorAll<HTMLButtonElement>('#toolbar [data-tool="raise"], #toolbar [data-tool="lower"]')
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
    knight: KNIGHT_MANA_COST,
    guardian: GUARDIAN_MANA_COST,
    volcano: VOLCANO_MANA_COST,
    flood: FLOOD_MANA_COST,
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
    if (!lastRedrawnBounds || !boundsEqual(bounds, lastRedrawnBounds) || renderer.isAnimating(bounds)) {
      renderer.redraw(bounds);
      lastRedrawnBounds = bounds;
    }
    entityLayer.update(simulation.world, deltaSeconds, simulation.getImpactEffects());
    const outcome = simulation.getOutcome();
    hud.update();
    statusPanel.update(simulation.summarize());
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
        // WORLDS is itself ordered by difficulty (see its own doc comment),
        // so the world's own position in the list doubles as a simple
        // difficulty indicator — no separate derived score needed. Map
        // size is no longer shown here since every world is the same
        // fixed 64x64 (see plan/0062-original-scale-map.md).
        detail.textContent = locked
          ? "パスワードが必要です"
          : `${TERRAIN_LABELS[world.terrain]}${ruleLabel}${personalityLabel}・難易度${index + 1}/${WORLDS.length}`;

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
