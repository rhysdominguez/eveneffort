import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vitest config kept separate from Next.js build so the two toolchains don't interfere.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    // Mirror the "@/*" -> "src/*" alias from tsconfig.json.
    alias: { "@": resolve(__dirname, "src") },
  },
});
