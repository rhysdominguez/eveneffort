import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vitest config kept separate from Next.js build so the two toolchains don't interfere.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Repairs window.localStorage, which jsdom leaves unreachable here. See the
    // file for why.
    setupFiles: ["src/test/setup.ts"],
    // scripts/ is build-time tooling, but the route normaliser is pure parsing
    // logic guarding a permanent identifier, so it is tested with everything
    // else. Nothing included here may touch the network — see Rule 9.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
    ],
  },
  resolve: {
    // Mirror the "@/*" -> "src/*" alias from tsconfig.json.
    alias: { "@": resolve(__dirname, "src") },
  },
});
