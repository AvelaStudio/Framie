import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          name: "@framie/core",
          include: ["packages/core/src/**/*.test.ts"],
          environment: "jsdom",
        },
      }),
      defineProject({
        test: {
          name: "@framie/peer",
          include: ["packages/peer/src/**/*.test.ts"],
          environment: "jsdom",
        },
      }),
      defineProject({
        test: {
          name: "@framie/react",
          include: ["packages/react/src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./packages/react/src/test-setup.ts"],
        },
      }),
    ],
  },
});
