import { Application, Container, Rectangle, type FederatedPointerEvent } from "pixi.js";
import {
  ARMAGEDDON_MANA_COST,
  EARTHQUAKE_MANA_COST,
  FLOOD_MANA_COST,
  KNIGHT_MANA_COST,
  SHRINE_MOVE_MANA_COST,
  SWAMP_MANA_COST,
  TERRAIN_EDIT_MANA_COST,
  TERRAIN_LABELS,
  VOLCANO_MANA_COST,
} from "./game/constants";
import type { EnemyMiracleEvent } from "./game/systems/enemyMiracles";
import { trySpendMana } from "./game/faction";
import { drownFlood } from "./game/flood";
import { Simulation, type GameOutcome, type MatchEvent } from "./game/simulation";
import { createSwamp } from "./game/swamp";
import { eruptVolcano } from "./game/volcano";
import { EntityLayer } from "./render/EntityLayer";
import { Hud } from "./render/Hud";
import { IsoRenderer } from "./render/IsoRenderer";
import { describeMatchEvent, formatMatchTime } from "./render/matchEventLabels";
import { Minimap } from "./render/Minimap";
import { wireToolbar, type ToolMode } from "./ui/toolbar";
import {
  DEFAULT_VOLCANO_RADIUS,
  applyEarthquake,
  applyFlood,
  applyVolcano,
  createHeightmap,
  raiseVertex,
  type TerrainType,
} from "./world/heightmap";

// Smaller than a desktop map: on a phone, showing the whole thing at once
// makes every tile too small to tap precisely, so the map is shown closer
// to native size and panned instead — see plan/archived/0009-pan-for-vertex-picking.md.
const WORLD_WIDTH = 20;
const WORLD_HEIGHT = 20;

/**
 * Every match rolls one of these for the whole map, per
 * docs/game-system.md's "地形タイプが複数あり...民の成長速度などに
 * 影響する". Until 征服モード (per-world terrain assignment) exists,
 * this is the only way a player ever sees TERRAIN_GROWTH_MULTIPLIER's
 * effect or the non-grass IsoRenderer colors at all.
 */
const TERRAIN_TYPES: TerrainType[] = ["grass", "desert", "snow", "rock"];

function pickRandomTerrain(): TerrainType {
  return TERRAIN_TYPES[Math.floor(Math.random() * TERRAIN_TYPES.length)];
}

/** Reserved space (screen px) above the map for the HUD text. */
const HUD_MARGIN = 90;
/** Never zoom in past this, even on a tall/narrow phone. */
const MAX_MAP_SCALE = 1.2;
/**
 * Bounds on the pinch-zoom multiplier applied on top of the auto-fit scale
 * layout() computes — see zoomFactor below. 0.5 lets a player pinch out far
 * enough to plan across the whole map; 2.5 lets them pinch in close enough
 * to place a precise edit without the auto-fit scale itself changing.
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

async function bootstrap() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: "#0a1a2a",
    antialias: true,
  });

  const container = document.getElementById("app");
  if (!container) throw new Error("#app element not found");
  container.appendChild(app.canvas);

  const heightmap = createHeightmap(WORLD_WIDTH, WORLD_HEIGHT, pickRandomTerrain());
  const renderer = new IsoRenderer(heightmap);

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
  app.stage.addChild(hud.view);

  const minimap = new Minimap(heightmap, MINIMAP_SIZE);
  app.stage.addChild(minimap.view);

  const enemyEventToast = document.getElementById("enemy-event-toast");
  let toastHideTimeout: ReturnType<typeof setTimeout> | undefined;

  // Surfaces enemy-cast miracles even when they happen outside the
  // player's current view — see index.html's comment on #enemy-event-toast
  // for why this matters more now that the enemy AI acts on its own.
  const showEnemyEventToast = (text: string) => {
    if (!enemyEventToast) return;
    enemyEventToast.textContent = text;
    enemyEventToast.classList.remove("hidden");
    clearTimeout(toastHideTimeout);
    toastHideTimeout = setTimeout(() => enemyEventToast.classList.add("hidden"), 3000);
  };

  // Mirrors the shake magnitudes applyTool uses for the player's own casts
  // of the same miracles (knight has no player-side shake to match, so
  // keeps its original, smaller value).
  const ENEMY_SHAKE_MAGNITUDE: Record<EnemyMiracleEvent["type"], number> = {
    armageddon: 10,
    volcano: 8,
    earthquake: 6,
    knight: 3,
  };

  const onEnemyAction = (event: EnemyMiracleEvent) => {
    showEnemyEventToast(describeMatchEvent(event.type, "enemy"));
    triggerShake(ENEMY_SHAKE_MAGNITUDE[event.type]);
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
    matchRecordPanel.classList.remove("hidden");
  };

  const simulation = new Simulation({ worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT, heightmap, onEnemyAction });

  // The "人口放出" action (see game/populationRelease.ts) — free and
  // instant like a behaviorMode change, so it's a plain button rather than
  // a ToolMode requiring a follow-up map tap. Only vibrates when it
  // actually did something, since a tap while no house has grown enough
  // yet is a silent no-op.
  const releasePopulationButton = document.getElementById("release-population");
  releasePopulationButton?.addEventListener("click", () => {
    if (simulation.releasePopulation("player") > 0) vibrate(15);
  });

  // Fit the map's height (not width) into the space below the HUD and
  // above the toolbar — portrait phones have more room vertically than
  // horizontally, so this keeps tiles big enough to tap while still
  // showing the map's full north-south extent; the player pans
  // left/right to reach the rest. currentScale = baseScale * zoomFactor:
  // baseScale is this auto-fit value (recomputed on resize), zoomFactor is
  // the player's own pinch-zoom adjustment on top of it (see
  // applyPinchTransform below) — kept separate so a resize (e.g. the
  // on-screen keyboard, though this app has no text input, or a rare
  // orientation flicker) doesn't wipe out a zoom the player dialed in.
  let baseScale = 1;
  let zoomFactor = 1;
  let currentScale = 1;
  const tutorialHint = document.getElementById("tutorial-hint");
  // Only a mouse-driven device needs telling about the wheel/keyboard
  // controls above — a touchscreen already has the two-finger gesture
  // doing the same job, and this text would just be noise there.
  if (tutorialHint && window.matchMedia("(pointer: fine)").matches) {
    tutorialHint.textContent += "\nPC: ホイールでズーム、Q/Eキーで回転できます。";
  }
  const layout = () => {
    const toolbarHeight = document.getElementById("toolbar")?.getBoundingClientRect().height ?? 0;
    const safeAreaTop = getSafeAreaInsetTop();
    const availableHeight = Math.max(200, app.screen.height - toolbarHeight - HUD_MARGIN - safeAreaTop);
    baseScale = Math.min(MAX_MAP_SCALE, availableHeight / renderer.mapPixelHeight);
    currentScale = baseScale * zoomFactor;
    renderer.view.scale.set(currentScale);
    renderer.centerOn(app.screen.width, app.screen.height);
    renderer.view.position.y += safeAreaTop;
    hud.setMaxWidth(app.screen.width);
    hud.setTopInset(safeAreaTop);
    minimap.view.position.set(app.screen.width - MINIMAP_SIZE - 10, 10 + safeAreaTop);
    if (tutorialHint) tutorialHint.style.bottom = `${toolbarHeight + 12}px`;
  };
  layout();
  window.addEventListener("resize", layout);

  // Nudges a first-time player toward the core loop — see Hud.ts's
  // comment on why the canvas HUD itself carries no such guidance.
  // Dismissed by the player's first terrain edit, or after a timeout for
  // anyone who's just watching instead of tapping.
  const dismissTutorialHint = () => tutorialHint?.classList.add("hidden");
  setTimeout(dismissTutorialHint, TUTORIAL_HINT_TIMEOUT_MS);

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
  // fixed target (the visible map's rough center) instead of the
  // two-finger midpoint. Used by the minimap's "tap to jump" (see
  // render/Minimap.ts's doc comment on why it exists).
  const centerViewOn = (worldX: number, worldY: number) => {
    const local = renderer.project(worldX, worldY);
    const cos = Math.cos(renderer.view.rotation);
    const sin = Math.sin(renderer.view.rotation);
    const scaledX = local.sx * currentScale;
    const scaledY = local.sy * currentScale;
    const target = { x: app.screen.width / 2, y: app.screen.height / 2 };
    const next = clampPan(target.x - (scaledX * cos - scaledY * sin), target.y - (scaledX * sin + scaledY * cos));
    renderer.view.position.set(next.x, next.y);
  };

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

  let toolMode: ToolMode = "raise";

  // Shared by the plain single-tap path (applyTool's own fallback, below)
  // and by ブラシ continuous painting (see the pointer handlers further
  // down) — both just need "spend mana, edit this one vertex, redraw".
  const applyTerrainEditAt = (vertex: { x: number; y: number }): void => {
    if (!trySpendMana(simulation.world, "player", TERRAIN_EDIT_MANA_COST)) return;
    raiseVertex(heightmap, vertex.x, vertex.y, toolMode === "lower" ? -1 : 1);
    renderer.redraw();
    dismissTutorialHint();
  };

  const applyTool = (event: FederatedPointerEvent) => {
    const local = renderer.view.toLocal(event.global);
    const vertex = renderer.pickVertex(local.x, local.y);
    if (!vertex) return;

    if (toolMode === "shrine") {
      if (!trySpendMana(simulation.world, "player", SHRINE_MOVE_MANA_COST)) return;
      simulation.moveShrine("player", vertex);
      simulation.recordEvent("player", "shrineMove");
      vibrate(15);
      return;
    }

    if (toolMode === "earthquake") {
      if (!trySpendMana(simulation.world, "player", EARTHQUAKE_MANA_COST)) return;
      applyEarthquake(heightmap, vertex.x, vertex.y);
      renderer.redraw();
      simulation.recordEvent("player", "earthquake");
      triggerShake(6);
      vibrate(40);
      return;
    }

    if (toolMode === "swamp") {
      if (!trySpendMana(simulation.world, "player", SWAMP_MANA_COST)) return;
      createSwamp(simulation.world, vertex.x, vertex.y);
      simulation.recordEvent("player", "swamp");
      vibrate(25);
      return;
    }

    if (toolMode === "volcano") {
      if (!trySpendMana(simulation.world, "player", VOLCANO_MANA_COST)) return;
      applyVolcano(heightmap, vertex.x, vertex.y);
      eruptVolcano(simulation.world, vertex.x, vertex.y, DEFAULT_VOLCANO_RADIUS);
      renderer.redraw();
      simulation.recordEvent("player", "volcano");
      triggerShake(8);
      vibrate([40, 30, 60]);
      return;
    }

    if (toolMode === "knight") {
      // Also a global effect (it acts on the leader, not the tapped spot).
      if (!trySpendMana(simulation.world, "player", KNIGHT_MANA_COST)) return;
      simulation.knightify("player");
      simulation.recordEvent("player", "knight");
      vibrate(30);
      return;
    }

    if (toolMode === "armageddon") {
      // Global effect on both factions at once, unlike every other miracle.
      if (!trySpendMana(simulation.world, "player", ARMAGEDDON_MANA_COST)) return;
      simulation.triggerArmageddon();
      simulation.recordEvent("player", "armageddon");
      triggerShake(10);
      vibrate([60, 40, 60, 40, 100]);
      return;
    }

    if (toolMode === "flood") {
      // Global effect — the tap only confirms the cast, its position doesn't matter.
      if (!trySpendMana(simulation.world, "player", FLOOD_MANA_COST)) return;
      applyFlood(heightmap);
      drownFlood(simulation.world, heightmap);
      renderer.redraw();
      simulation.recordEvent("player", "flood");
      triggerShake(5);
      vibrate(50);
      return;
    }

    applyTerrainEditAt(vertex);
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
  // vertex the pointer then passes over gets edited once. Flattening a
  // wide area becomes one smooth gesture instead of many precise
  // individual taps. Restricted to the "raise"/"lower" tools (checked at
  // each call site below): every other toolMode is a single deliberate,
  // often expensive miracle cast that a drag should never be able to repeat.
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let painting = false;
  let lastPaintedVertex: { x: number; y: number } | undefined;

  const clearLongPressTimer = () => {
    if (longPressTimer === undefined) return;
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  };

  const stopPainting = () => {
    clearLongPressTimer();
    painting = false;
    lastPaintedVertex = undefined;
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

      if (toolMode === "raise" || toolMode === "lower") {
        clearLongPressTimer();
        longPressTimer = setTimeout(() => {
          longPressTimer = undefined;
          if (!pointerActive || isDragging || activePointers.size !== 1) return;
          painting = true;
          vibrate(10); // brief confirmation that painting just engaged
          const local = renderer.view.toLocal(event.global);
          const vertex = renderer.pickVertex(local.x, local.y);
          if (vertex) {
            applyTerrainEditAt(vertex);
            lastPaintedVertex = vertex;
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
      const vertex = renderer.pickVertex(local.x, local.y);
      // Only edits when the pointer has moved onto a *different* vertex
      // than the last one painted this stroke — otherwise holding still
      // would keep re-editing (and re-charging mana for) the same spot
      // every single pointermove event.
      if (vertex && (!lastPaintedVertex || vertex.x !== lastPaintedVertex.x || vertex.y !== lastPaintedVertex.y)) {
        applyTerrainEditAt(vertex);
        lastPaintedVertex = vertex;
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
    renderer.redraw();
    entityLayer.update(simulation.world, deltaSeconds);
    const outcome = simulation.getOutcome();
    hud.update(simulation.summarize(), outcome);
    if (outcome.over && !matchRecordShown) {
      matchRecordShown = true;
      showMatchRecord(outcome, simulation.getMatchEvents());
    }
    minimap.update(simulation.world);

    if (shakeTimeRemaining > 0) {
      shakeTimeRemaining = Math.max(0, shakeTimeRemaining - deltaSeconds);
      const strength = (shakeTimeRemaining / SHAKE_DURATION) * shakeMagnitude;
      worldContainer.position.set((Math.random() * 2 - 1) * strength, (Math.random() * 2 - 1) * strength);
    } else if (worldContainer.position.x !== 0 || worldContainer.position.y !== 0) {
      worldContainer.position.set(0, 0);
    }
  });
}

bootstrap();
