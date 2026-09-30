import { build } from "esbuild";

const options = {
  bundle: true,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  platform: "node",
  format: "esm",
  target: "node24",
};

await build({
  ...options,
  entryPoints: ["runtime.mjs"],
  outfile: process.argv[2] ?? "dist/runtime.mjs",
});
if (!process.argv[2]) {
  await build({
    ...options,
    entryPoints: ["recurring-runtime.mjs"],
    outfile: "dist/recurring-runtime.mjs",
  });
}
