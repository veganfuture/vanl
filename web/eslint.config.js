import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import solidTypescript from "eslint-plugin-solid/configs/typescript";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".output/**",
      ".nitro/**",
      ".vinxi/**",
      ".direnv/**",
      ".devdb/**",
      "dist/**",
    ],
  },
  js.configs.recommended,
  {
    // Isomorphic app code: the same files can run in the browser or in Node,
    // so both global sets apply rather than splitting per-file.
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Base no-undef doesn't understand TS type-only positions (flags global
      // lib.dom types like BufferSource) — tsc already checks this correctly.
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...solidTypescript,
  },
];
