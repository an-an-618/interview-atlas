import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: process.env.ATLAS_VITE_CACHE_DIR || "node_modules/.vite",
  server: {
    host: "127.0.0.1",
    port: 43118,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/.tools/**", "**/.dmg-stage.*/**"],
    },
  },
});
