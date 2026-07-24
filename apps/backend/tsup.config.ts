import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  target: "esnext",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Bundle first-party code; keep node_modules external so native deps (pg) work.
  skipNodeModulesBundle: true,
});
