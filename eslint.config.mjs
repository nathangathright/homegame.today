import js from "@eslint/js";
import pluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  // Astro flat recommended config
  ...pluginAstro.configs["flat/recommended"],
  // TypeScript parsing for TS files used in scripts and API routes
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {},
  },
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];


