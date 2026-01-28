import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";
import { resolve } from "node:path";

export default defineConfig({
  // Wails 在 file:///embedded 场景下需要相对路径
  base: "./",
  plugins: [svgr(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@common": resolve(__dirname, "../common/src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
