import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: null,
      manifest: false,
      registerType: "prompt",
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,json,webmanifest}"],
        globIgnores: ["**/*.{apkg,colpkg,anki2,anki21,anki21b}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: [],
    globals: true,
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
