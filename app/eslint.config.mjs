import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// Rules are "error" where the codebase is already clean — those can never
// regress. Rules with an existing backlog are "warn" with the current count
// noted, so the debt stays visible instead of switched off. Drive a count to
// zero, then promote the rule to "error".
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "sitepins/custom-rules",
    settings: {
      react: {
        version: "19.2",
      },
    },
    rules: {
      // ==========================================
      // TypeScript Rules
      // ==========================================
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-wrapper-object-types": "error",

      // ==========================================
      // JavaScript/General Rules
      // ==========================================
      eqeqeq: ["error", "smart"],
      "no-console": "error",
      "no-var": "error",
      "prefer-const": "error",

      // ==========================================
      // Next.js Specific Rules
      // ==========================================
      "@next/next/no-img-element": "warn", // backlog: 12

      // ==========================================
      // React Rules
      // ==========================================
      "react/display-name": "warn", // backlog: 3, Plate render wrappers
      "react/jsx-no-undef": "error",
      "react/no-unescaped-entities": "error",

      // ==========================================
      // React Hooks Rules
      // ==========================================
      // React Compiler diagnostics. The first four are real defects; the last
      // two only report that the compiler skipped optimizing a component.
      "react-hooks/immutability": "warn", // backlog: 1
      "react-hooks/refs": "warn", // backlog: 4
      // backlog: 11, all synchronising with something outside React —
      // sockets, timers, DOM measurement, async I/O and parent callbacks.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn", // backlog: 1
      "react-hooks/use-memo": "warn", // backlog: 1
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",

      // ==========================================
      // Import Rules
      // ==========================================
      "import/no-anonymous-default-export": "error",

      // ==========================================
      // Accessibility (a11y) Rules
      // ==========================================
      "jsx-a11y/alt-text": "error",
    },
  },
  // Override default ignores of eslint-config-next
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
