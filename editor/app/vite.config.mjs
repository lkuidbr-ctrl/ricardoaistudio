import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const APP = path.dirname(fileURLToPath(import.meta.url));

// Versão mostrada no topo do app: data da montagem + commit (quando há Git).
const versao = (() => {
  const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  try {
    const commit = execSync("git rev-parse --short HEAD", { cwd: APP, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return `${data} · ${commit}`;
  } catch {
    return data;
  }
})();

export default defineConfig({
  root: path.join(APP, "src"),
  base: "/",
  // A pasta public/ do editor é servida pelo server.mjs, não copiada para o build.
  publicDir: false,
  build: { outDir: path.join(APP, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  oxc: { jsx: { runtime: "automatic" } },
  define: { __VERSAO_STUDIO__: JSON.stringify(versao) },
  server: {
    proxy: { "/api": "http://127.0.0.1:3210", "/out": "http://127.0.0.1:3210" },
  },
});
