import { Application } from "pixi.js";
import { EARTHQUAKE_MANA_COST, TERRAIN_EDIT_MANA_COST } from "./game/constants";
import { trySpendMana } from "./game/faction";
import { Simulation } from "./game/simulation";
import { EntityLayer } from "./render/EntityLayer";
import { Hud } from "./render/Hud";
import { IsoRenderer } from "./render/IsoRenderer";
import { wireToolbar, type ToolMode } from "./ui/toolbar";
import { applyEarthquake, createHeightmap, raiseVertex } from "./world/heightmap";

const WORLD_WIDTH = 32;
const WORLD_HEIGHT = 32;

/** Fraction of the screen width the map is allowed to fill when fitting a phone screen. */
const MAP_FIT_MARGIN = 0.92;

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

  // Portrait phones are narrower than the map's projected width, so scale
  // the whole map (and everything drawn inside it) down to fit — see
  // docs/tech-stack.md's "縦持ちスマホPWA".
  const layout = () => {
    const scale = Math.min(1, (app.screen.width * MAP_FIT_MARGIN) / renderer.mapPixelWidth);
    renderer.view.scale.set(scale);
    renderer.centerOn(app.screen.width, app.screen.height);
    hud.setMaxWidth(app.screen.width);
  };
  layout();
  window.addEventListener("resize", layout);

  let toolMode: ToolMode = "raise";

  // Tap applies whichever tool is selected (raise/lower terrain, or an
  // earthquake), paid for out of the player faction's mana. There's no
  // right-click on a touchscreen, so raise/lower are separate tools
  // picked from the toolbar rather than left/right click.
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
    raiseVertex(heightmap, vertex.x, vertex.y, toolMode === "lower" ? -1 : 1);
    renderer.redraw();
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
