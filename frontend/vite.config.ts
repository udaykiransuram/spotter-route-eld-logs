import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "..",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // MapLibre is intentionally isolated behind the lazy-loaded results map.
    chunkSizeWarningLimit: 1100,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
