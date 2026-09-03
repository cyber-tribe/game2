import { Application } from "pixi.js";
import type { BehaviorMode } from "./game/components";
import { EARTHQUAKE_MANA_COST, TERRAIN_EDIT_MANA_COST } from "./game/constants";
import { trySpendMana } from "./game/faction";
import { Simulation } from "./game/simulation";
import { EntityLayer } from "./render/EntityLayer";
import { Hud } from "./render/Hud";
import { IsoRenderer } from "./render/IsoRenderer";
import { applyEarthquake, createHeightmap, raiseVertex } from "./world/heightmap";

const WORLD_WIDTH = 32;
const WORLD_HEIGHT = 32;

type ToolMode = "terrain" | "earthquake";

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

  const center = () => renderer.centerOn(app.screen.width, app.screen.height);
  center();
  window.addEventListener("resize", center);

  let toolMode: ToolMode = "terrain";

  // Click applies whichever tool is selected (terrain edit or earthquake),
  // paid for out of the player faction's mana.
  app.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointerdown", (event) => {
    const local = renderer.view.toLocal(event.global);
    const vertex = renderer.pickVertex(local.x, local.y);
    if (!vertex) return;

    if (toolMode === "earthquake") {
      if (!trySpendMana(simulation.world, "player", EARTHQUAKE_MANA_COST)) return;
      applyEarthquake(heightmap, vertex.x, vertex.y);
      renderer.redraw();
      return;
    }

    if (!trySpendMana(simulation.world, "player", TERRAIN_EDIT_MANA_COST)) return;
    const delta = event.button === 2 ? -1 : 1;
    raiseVertex(heightmap, vertex.x, vertex.y, delta);
    renderer.redraw();
  });

  // 1/2/3 switch the player's own behaviorMode (settle/gather/fight) —
  // free, per docs/game-system.md's 行動方針. 4/5 pick which miracle a
  // click casts.
  const BEHAVIOR_MODE_KEYS: Record<string, BehaviorMode> = { Digit1: "settle", Digit2: "gather", Digit3: "fight" };
  const TOOL_KEYS: Record<string, ToolMode> = { Digit4: "terrain", Digit5: "earthquake" };
  window.addEventListener("keydown", (event) => {
    const mode = BEHAVIOR_MODE_KEYS[event.code];
    if (mode) simulation.setBehaviorMode("player", mode);

    const tool = TOOL_KEYS[event.code];
    if (tool) toolMode = tool;
  });

  app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaMS / 1000;
    simulation.update(deltaSeconds);
    entityLayer.update(simulation.world);
    hud.update(simulation.summarize(), simulation.getOutcome(), toolMode);
  });
}

bootstrap();
