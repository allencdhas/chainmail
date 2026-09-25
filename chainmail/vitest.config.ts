import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // src/server.ts: not yet created. src/graph/client.ts: thin real-network
      // wrapper around the Graph SDK, documented as integration-test-only in
      // its own file header — intentionally excluded from the coverage gate.
      exclude: [
        "src/server.ts",
        "src/graph/client.ts",
        "src/ens/client.ts",
        "src/agent/anthropicClient.ts",
        "src/ledger/graphSync.ts",
        "src/**/*.d.ts",
      ],
    },
  },
});
