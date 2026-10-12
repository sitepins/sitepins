import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      BRAND_NAME: "Sitepins",
      BRAND_URL: "https://sitepins.com",
      BRAND_SLUG: "sitepins",
      BRAND_SUPPORT_URL: "https://sitepins.com/contact",
      GIT_APP_NAME: "sitepins-test",
    },
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
