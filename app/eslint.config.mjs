import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

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
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-wrapper-object-types": "off",

      // ==========================================
      // JavaScript/General Rules
      // ==========================================
      "no-empty-object-type": "off",
      "no-explicit-any": "off",
      "prefer-const": "off",

      // ==========================================
      // Next.js Specific Rules
      // ==========================================
      "@next/next/no-img-element": "off",

      // ==========================================
      // React Rules
      // ==========================================
      "react/display-name": "off",
      "react/jsx-no-undef": "off",
      "react/no-unescaped-entities": "off",

      // ==========================================
      // React Hooks Rules
      // ==========================================
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",

      // ==========================================
      // Import Rules
      // ==========================================
      "import/no-anonymous-default-export": "off",

      // ==========================================
      // Accessibility (a11y) Rules
      // ==========================================
      "jsx-a11y/alt-text": "off",
    },
  },
  // Override default ignores of eslint-config-next
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
