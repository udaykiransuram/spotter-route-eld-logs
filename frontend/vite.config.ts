import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  if (mode === "production" && !env.VITE_API_BASE_URL?.trim()) {
    throw new Error(
      "VITE_API_BASE_URL is required for production builds so the deployed app never targets localhost.",
    );
  }

  return {
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
  };
});
