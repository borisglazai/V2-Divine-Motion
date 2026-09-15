// @ts-check
import tseslint from "typescript-eslint";
import eslintPluginAstro from "eslint-plugin-astro";

export default tseslint.config(
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs["flat/recommended"],
  {
    rules: {
      // Astro components commonly declare an unused-looking `Props`
      // interface that Astro's compiler consumes implicitly.
      "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^Props$" }],
    },
  },
  {
    // Astro's own generated-types convention requires a triple-slash
    // reference here — there is no import-style equivalent.
    files: ["src/env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
);
