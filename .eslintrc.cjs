/* eslint-env node */
module.exports = {
  root: true,
  env: { es2022: true, browser: true, node: true },
  extends: [
    "eslint:recommended",
  ],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      plugins: ["@typescript-eslint"],
      extends: [
        "plugin:@typescript-eslint/recommended",
      ],
    },
    {
      files: ["**/*.astro"],
      processor: "astro/client-side-ts",
      extends: [
        "plugin:astro/recommended",
      ],
      rules: {},
    },
  ],
  ignorePatterns: ["dist/", "node_modules/"],
};


