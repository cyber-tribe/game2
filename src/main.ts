import { Application, type FederatedPointerEvent } from "pixi.js";
import {
  EARTHQUAKE_MANA_COST,
  FLOOD_MANA_COST,
  KNIGHT_MANA_COST,
  SHRINE_MOVE_MANA_COST,
  SWAMP_MANA_COST,
  TERRAIN_EDIT_MANA_COST,
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
} from "./world/heightmap";

// Smaller than a desktop map: on a phone, showing the whole thing at once
// makes every tile too small to tap precisely, so the map is shown closer
// to native size and panned instead — see docs/tech-stack.md.
const WORLD_WIDTH = 20;
const WORLD_HEIGHT = 20;

/** Reserved space (screen px) above the map for the HUD text. */
const HUD_MARGIN = 90;
/** Never zoom in past this, even on a tall/narrow phone. */
const MAX_MAP_SCALE = 1.2;
/** A finger-drag shorter than this (px) is treated as a tap, not a pan. */
const DRAG_THRESHOLD = 10;

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

  const heightmap = createHeightmap(WORLD_WIDTH, WORLD_HEIGHT);
  const renderer = new IsoRenderer(heightmap);
  app.stage.addChild(renderer.view);

  const entityLayer = new EntityLayer(renderer);
  renderer.view.addChild(entityLayer.view);

  const hud = new Hud();
  app.stage.addChild(hud.view);

  const simulation = new Simulation({ worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT, heightmap });

  // Fit the map's height (not width) into the space below the HUD and
  // above the toolbar — portrait phones have more room vertically than
  // horizontally, so this keeps tiles big enough to tap while still
  // showing the map's full north-south extent; the player pans
  // left/right to reach the rest.
  let currentScale = 1;
  const layout = () => {
    const toolbarHeight = document.getElementById("toolbar")?.getBoundingClientRect().height ?? 0;
    const availableHeight = Math.max(200, app.screen.height - toolbarHeight - HUD_MARGIN);
    currentScale = Math.min(MAX_MAP_SCALE, availableHeight / renderer.mapPixelHeight);
    renderer.view.scale.set(currentScale);
    renderer.centerOn(app.screen.width, app.screen.height);
    hud.setMaxWidth(app.screen.width);
  };
  layout();
  window.addEventListener("resize", layout);

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
  };

  // A short tap applies the selected tool; dragging beyond DRAG_THRESHOLD
  // pans the camera instead. Distinguishing the two is what lets a
  // one-finger touchscreen do both without a dedicated "pan mode" toggle.
  let pointerActive = false;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let viewStartPos = { x: 0, y: 0 };

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  app.stage.on("pointerdown", (event) => {
    pointerActive = true;
    isDragging = false;
    dragStart = { x: event.global.x, y: event.global.y };
    viewStartPos = { x: renderer.view.position.x, y: renderer.view.position.y };
  });

  app.stage.on("pointermove", (event) => {
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
    if (pointerActive && !isDragging) applyTool(event);
    pointerActive = false;
    isDragging = false;
  });
  app.stage.on("pointerupoutside", () => {
    pointerActive = false;
    isDragging = false;
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
