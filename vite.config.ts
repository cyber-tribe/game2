import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages (see .github/workflows/static.yml) serves this project from
// https://<owner>.github.io/game2/, a subpath — so a production build needs
// every asset/manifest path prefixed with /game2/, or the built index.html
// requests scripts from the domain root and 404s (a blank, unresponsive
// page). `vite dev`/`vite preview` stay at "/" so local workflows are
// unaffected; `start_url`/`scope` are left unset in the manifest below so
// vite-plugin-pwa derives them from this same base automatically.
export default defineConfig(({ command }) => ({
  root: ".",
  base: command === "build" ? "/game2/" : "/",
  build: {
    outDir: "dist",
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"],
      manifest: {
        name: "game2",
        short_name: "game2",
        description: "神視点リアルタイム戦略ゲーム",
        lang: "ja",
        display: "standalone",
        // Portrait phones only — see plan/archived/0008-portrait-smartphone-pwa.md.
        orientation: "portrait",
        background_color: "#0a1a2a",
        theme_color: "#0a1a2a",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
}));
