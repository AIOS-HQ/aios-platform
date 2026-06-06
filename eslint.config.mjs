import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Honor the underscore convention for intentionally-unused identifiers.
  // e.g. `getAdapter(_kind: ChannelKind)` keeps the parameter for its public
  // type signature without using it in the body. Names prefixed with `_` are
  // ignored; every other unused identifier still warns.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node utility scripts (run via `node`, not bundled or typechecked by Next).
    "scripts/**",
  ]),
]);

export default eslintConfig;
