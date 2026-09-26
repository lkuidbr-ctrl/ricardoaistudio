import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const APP = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(APP, "src"),
  base: "/",
  // A pasta public/ do editor é servida pelo server.mjs, não copiada para o build.
  publicDir: false,
  build: { outDir: path.join(APP, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  oxc: { jsx: { runtime: "automatic" } },
  server: {
    proxy: { "/api": "http://127.0.0.1:3210", "/out": "http://127.0.0.1:3210" },
  },
});
