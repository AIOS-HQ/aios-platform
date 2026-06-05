import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const serverOnlyStub = fileURLToPath(
  new URL("./tests/stubs/empty.ts", import.meta.url),
);

/**
 * Vitest config for Harmony core-logic unit tests.
 *
 * - `@/*` is mirrored from tsconfig so tests can import app modules.
 * - `server-only` is a Next/RSC marker with no runtime; it is stubbed so server
 *   modules with pure helpers (e.g. `todayTasks`) can be imported in Node.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: serverOnlyStub },
      { find: /^@\/(.*)$/, replacement: `${srcDir}/$1` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
