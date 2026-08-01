import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the `paths` in tsconfig.json. Order matters: Vite matches aliases in
// sequence, so a bare `@/` first would swallow the more specific prefixes and
// anything importing `@/editor/*` or `@/components/*` would fail to resolve.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/components\//,
        replacement: path.resolve(__dirname, "src/layouts/components") + "/",
      },
      {
        find: /^@\/partials\//,
        replacement: path.resolve(__dirname, "src/layouts/partials") + "/",
      },
      {
        find: /^@\/helpers\//,
        replacement: path.resolve(__dirname, "src/layouts/helpers") + "/",
      },
      {
        find: /^@\/editor\//,
        replacement: path.resolve(__dirname, "src/layouts/editor") + "/",
      },
      { find: /^@\//, replacement: path.resolve(__dirname, "src") + "/" },
      // Editor plugins import stylesheets; the node environment cannot load
      // them and nothing under test depends on their contents.
      {
        find: /^.*\.(css|scss)$/,
        replacement: path.resolve(__dirname, "src/test/style-stub.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    // Editor plugin packages import stylesheets. They must be processed by
    // Vite (which the alias above stubs) rather than left to Node's loader.
    server: { deps: { inline: [/katex/, /platejs/, /@platejs/] } },
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["src/test/setup-env.ts"],
  },
});
