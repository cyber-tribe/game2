import { Application } from "pixi.js";
import { createHeightmap } from "./world/heightmap";
import { IsoRenderer } from "./render/IsoRenderer";

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

  const heightmap = createHeightmap(32, 32);
  const renderer = new IsoRenderer(heightmap);
  app.stage.addChild(renderer.view);
  renderer.centerOn(app.screen.width, app.screen.height);

  window.addEventListener("resize", () => {
    renderer.centerOn(app.screen.width, app.screen.height);
  });
}

bootstrap();
