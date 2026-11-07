import { defineConfig } from "tsdown";

// Standalone build config: the SDK is consumed outside the monorepo, so it
// ships declarations.
export default defineConfig({
  entry: ["src/index.ts", "src/embed/index.ts", "src/webhooks/index.ts"],
  unbundle: true,
  platform: "node",
  format: "esm",
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    onlyBundle: [],
    resolveDepSubpath: true,
  },
});
