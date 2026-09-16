import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages (see .github/workflows/static.yml) serves this project from
// https://<owner>.github.io/game2/, a subpath — so a production build needs
// every asset/manifest path prefixed with /game2/, or the built index.html
// requests scripts from the domain root and 404s (a blank, unresponsive
// page). `start_url`/`scope` are left unset in the manifest below so
// vite-plugin-pwa derives them from this same base automatically.
//
// **`vite preview` needs the build's base too**, which is why `isPreview` is
// here and not just `command === "build"`. Preview serves `dist/` — a build
// whose index.html already has /game2/ baked into every script tag — so
// hosting it at "/" makes the page request /game2/assets/*.js from a server
// that only knows "/". Its SPA fallback answers those with index.html and a
// 200, so curl looks fine while the browser gets HTML where it asked for
// JavaScript: the page renders its static shell and the game never starts.
// Only `vite dev` (command "serve", not preview) serves from source at "/".
export default defineConfig(({ command, isPreview }) => ({
  root: ".",
  base: command === "build" || isPreview ? "/game2/" : "/",
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
