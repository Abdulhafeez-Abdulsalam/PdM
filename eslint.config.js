/**
 * ESLint: finds likely bugs and enforces team rules. One config for the whole monorepo;
 * each package runs `eslint .` and ESLint finds this file by walking up the folders.
 *
 * Formatting (spaces, quotes, line breaks) is NOT ESLint's job here — Prettier does that,
 * and eslint-config-prettier switches off any ESLint rules that would fight it.
 */
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Architecture §3 dependency rules: which of our packages each package may import. */
const ourPackages = ["@pdm/contracts", "@pdm/api-client", "@pdm/mock-data", "@pdm/ui", "@pdm/charts", "@pdm/web"];
const onlyAllow = (allowed) => ({
  "no-restricted-imports": [
    "error",
    {
      paths: ourPackages
        .filter((p) => !allowed.includes(p))
        .map((name) => ({ name, message: "Not allowed by the package dependency rules (docs/01-architecture §3)." })),
    },
  ],
});

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-server/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/storybook-static/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Unused variables are usually leftovers or bugs. Prefix with _ to say "unused on purpose".
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      // `import type` makes it obvious what's only used for types (and is erased from the build).
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      eqeqeq: ["error", "smart"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Accessibility rules for everything that renders UI.
  { files: ["apps/web/**/*.tsx", "packages/ui/**/*.tsx", "packages/charts/**/*.tsx"], ...jsxA11y.flatConfigs.recommended },

  // Package boundaries (architecture §3).
  { files: ["packages/contracts/**"], rules: onlyAllow([]) },
  { files: ["packages/ui/**"], rules: onlyAllow([]) },
  { files: ["packages/charts/**"], rules: onlyAllow([]) },
  { files: ["packages/mock-data/**"], rules: onlyAllow(["@pdm/contracts"]) },
  { files: ["packages/api-client/**"], rules: onlyAllow(["@pdm/contracts"]) },
  // Tests may use the mock backend to exercise the real thing.
  { files: ["packages/api-client/**/*.test.ts"], rules: onlyAllow(["@pdm/contracts", "@pdm/mock-data"]) },

  // Node-run files (configs, scripts).
  { files: ["*.js", "**/*.config.{js,ts}"], languageOptions: { globals: { ...globals.node } } },

  // Tests and the printed tour may log.
  { files: ["**/*.test.{ts,tsx}"], rules: { "no-console": "off" } },

  prettier,
);
