import { Application, type FederatedPointerEvent } from "pixi.js";
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
import { trySpendMana } from "./game/faction";
import { drownFlood } from "./game/flood";
import { Simulation } from "./game/simulation";
import { createSwamp } from "./game/swamp";
import { eruptVolcano } from "./game/volcano";
import { EntityLayer } from "./render/EntityLayer";
import { Hud } from "./render/Hud";
import { IsoRenderer } from "./render/IsoRenderer";
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
/** A finger-drag shorter than this (px) is treated as a tap, not a pan. */
const DRAG_THRESHOLD = 10;
/** How long #tutorial-hint stays up if the player never makes a terrain edit. */
const TUTORIAL_HINT_TIMEOUT_MS = 15000;

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
  app.stage.addChild(renderer.view);

  const entityLayer = new EntityLayer(renderer);
  renderer.view.addChild(entityLayer.view);

  const hud = new Hud();
  hud.setTerrain(TERRAIN_LABELS[heightmap.terrain]);
  app.stage.addChild(hud.view);

  const simulation = new Simulation({ worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT, heightmap });

  // Fit the map's height (not width) into the space below the HUD and
  // above the toolbar — portrait phones have more room vertically than
  // horizontally, so this keeps tiles big enough to tap while still
  // showing the map's full north-south extent; the player pans
  // left/right to reach the rest.
  let currentScale = 1;
  const tutorialHint = document.getElementById("tutorial-hint");
  const layout = () => {
    const toolbarHeight = document.getElementById("toolbar")?.getBoundingClientRect().height ?? 0;
    const safeAreaTop = getSafeAreaInsetTop();
    const availableHeight = Math.max(200, app.screen.height - toolbarHeight - HUD_MARGIN - safeAreaTop);
    currentScale = Math.min(MAX_MAP_SCALE, availableHeight / renderer.mapPixelHeight);
    renderer.view.scale.set(currentScale);
    renderer.centerOn(app.screen.width, app.screen.height);
    renderer.view.position.y += safeAreaTop;
    hud.setMaxWidth(app.screen.width);
    hud.setTopInset(safeAreaTop);
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

  let toolMode: ToolMode = "raise";

  const applyTool = (event: FederatedPointerEvent) => {
    const local = renderer.view.toLocal(event.global);
    const vertex = renderer.pickVertex(local.x, local.y);
    if (!vertex) return;

    if (toolMode === "shrine") {
      if (!trySpendMana(simulation.world, "player", SHRINE_MOVE_MANA_COST)) return;
      simulation.moveShrine("player", vertex);
      return;
    }

    if (toolMode === "earthquake") {
      if (!trySpendMana(simulation.world, "player", EARTHQUAKE_MANA_COST)) return;
      applyEarthquake(heightmap, vertex.x, vertex.y);
      renderer.redraw();
      return;
    }

    if (toolMode === "swamp") {
      if (!trySpendMana(simulation.world, "player", SWAMP_MANA_COST)) return;
      createSwamp(simulation.world, vertex.x, vertex.y);
      return;
    }

    if (toolMode === "volcano") {
      if (!trySpendMana(simulation.world, "player", VOLCANO_MANA_COST)) return;
      applyVolcano(heightmap, vertex.x, vertex.y);
      eruptVolcano(simulation.world, vertex.x, vertex.y, DEFAULT_VOLCANO_RADIUS);
      renderer.redraw();
      return;
    }

    if (toolMode === "knight") {
      // Also a global effect (it acts on the leader, not the tapped spot).
      if (!trySpendMana(simulation.world, "player", KNIGHT_MANA_COST)) return;
      simulation.knightify("player");
      return;
    }

    if (toolMode === "armageddon") {
      // Global effect on both factions at once, unlike every other miracle.
      if (!trySpendMana(simulation.world, "player", ARMAGEDDON_MANA_COST)) return;
      simulation.triggerArmageddon();
      return;
    }

    if (toolMode === "flood") {
      // Global effect — the tap only confirms the cast, its position doesn't matter.
      if (!trySpendMana(simulation.world, "player", FLOOD_MANA_COST)) return;
      applyFlood(heightmap);
      drownFlood(simulation.world, heightmap);
      renderer.redraw();
      return;
    }

    if (!trySpendMana(simulation.world, "player", TERRAIN_EDIT_MANA_COST)) return;
    raiseVertex(heightmap, vertex.x, vertex.y, toolMode === "lower" ? -1 : 1);
    renderer.redraw();
    dismissTutorialHint();
  };

  // A short tap applies the selected tool; dragging beyond DRAG_THRESHOLD
  // pans the camera instead. Distinguishing the two is what lets a
  // one-finger touchscreen do both without a dedicated "pan mode" toggle.
  let pointerActive = false;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let viewStartPos = { x: 0, y: 0 };

  // A second finger switches to rotating the map instead of panning/
  // tapping. Tracked by pointerId (not just a count) since PixiJS's
  // multi-touch events distinguish fingers that way.
  const activePointers = new Map<number, { x: number; y: number }>();
  let rotating = false;
  let lastTwoFingerAngle = 0;
  // Set for the whole gesture (first finger down to last finger up) once
  // a second finger joins, so lifting back to one finger doesn't fire a
  // tap and releasing the last finger doesn't resume panning.
  let gestureHadTwoFingers = false;

  const twoFingerAngle = (points: { x: number; y: number }[]): number => {
    const [a, b] = points;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  // Rotates renderer.view by deltaAngle while keeping the point currently
  // under screen position `pivot` visually fixed in place — the standard
  // "twist" gesture feel, anchored on the midpoint between the two
  // fingers rather than spinning around the map's corner.
  const rotateAroundPivot = (pivot: { x: number; y: number }, deltaAngle: number) => {
    const local = renderer.view.toLocal(pivot);
    renderer.view.rotation += deltaAngle;
    const cos = Math.cos(renderer.view.rotation);
    const sin = Math.sin(renderer.view.rotation);
    const scaledX = local.x * currentScale;
    const scaledY = local.y * currentScale;
    renderer.view.position.set(pivot.x - (scaledX * cos - scaledY * sin), pivot.y - (scaledX * sin + scaledY * cos));
  };

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  app.stage.on("pointerdown", (event) => {
    activePointers.set(event.pointerId, { x: event.global.x, y: event.global.y });

    if (activePointers.size === 2) {
      gestureHadTwoFingers = true;
      rotating = true;
      pointerActive = false;
      isDragging = false;
      lastTwoFingerAngle = twoFingerAngle([...activePointers.values()]);
      return;
    }

    if (activePointers.size === 1) {
      gestureHadTwoFingers = false;
      pointerActive = true;
      isDragging = false;
      dragStart = { x: event.global.x, y: event.global.y };
      viewStartPos = { x: renderer.view.position.x, y: renderer.view.position.y };
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
      rotateAroundPivot({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }, delta);
      lastTwoFingerAngle = angle;
      return;
    }

    if (!pointerActive) return;
    const dx = event.global.x - dragStart.x;
    const dy = event.global.y - dragStart.y;
    if (!isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) isDragging = true;
    if (isDragging) {
      const next = clampPan(viewStartPos.x + dx, viewStartPos.y + dy);
      renderer.view.position.set(next.x, next.y);
    }
  });

  app.stage.on("pointerup", (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) rotating = false;

    if (pointerActive && !isDragging && !gestureHadTwoFingers) applyTool(event);

    pointerActive = false;
    isDragging = false;
    if (activePointers.size === 0) gestureHadTwoFingers = false;
  });
  app.stage.on("pointerupoutside", (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) rotating = false;

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
    entityLayer.update(simulation.world);
    hud.update(simulation.summarize(), simulation.getOutcome());
  });
}

bootstrap();
