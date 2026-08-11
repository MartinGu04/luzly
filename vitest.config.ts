import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Next.js's server bundler aliases "server-only" to its no-op stub
      // when compiling for the server; Vitest has no such bundler-level
      // awareness, so it needs the same alias to exercise this code at all.
      "server-only": path.resolve(import.meta.dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
