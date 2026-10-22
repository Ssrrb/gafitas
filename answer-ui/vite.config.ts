import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const CSP = "default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'";

// The shipped page pins its own CSP; dev keeps Vite's inline HMR preamble working.
const pinCsp = (): Plugin => ({
  name: "gafitas-csp",
  apply: "build",
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
});

export default defineConfig({
  base: "./",
  plugins: [react(), pinCsp()],
  resolve: {
    alias: {
      // react-lang auto-mounts a devtools widget from a CDN in development. Never load it.
      "@openuidev/devtools": fileURLToPath(new URL("./src/dev/no-devtools.ts", import.meta.url)),
      // lang-core's telemetry (opt-in, Node only, inert in a page) imports ci-info lazily; keep it out of the bundle.
      "ci-info": fileURLToPath(new URL("./src/dev/no-ci-info.ts", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../Resources/answer-ui", import.meta.url)),
    emptyOutDir: true,
    assetsDir: "assets",
    modulePreload: { polyfill: false },
    sourcemap: false,
    target: "safari16",
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
