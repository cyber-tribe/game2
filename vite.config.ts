import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: ".",
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
        start_url: "/",
        display: "standalone",
        // Portrait phones only — see docs/tech-stack.md.
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
});
