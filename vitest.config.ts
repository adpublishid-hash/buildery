import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Project path alias (matches tsconfig "@/*").
      "@": path.resolve(__dirname),
      // Stub Next/server-only modules so server-tagged libs can be
      // imported and their pure functions unit-tested.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      "next/headers": path.resolve(__dirname, "test/stubs/next-headers.ts"),
    },
  },
});
