import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const api = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const { build } = createRequire(new URL("../../apps/api/package.json", import.meta.url))("esbuild");

test("the shipping API bundle cannot import protocol fixtures or the former push provider", async () => {
  const result = await build({
    absWorkingDir: api,
    entryPoints: ["runtime.mjs"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const forbidden = Object.keys(result.metafile.inputs).filter((path) =>
    /(?:^|\/)(?:protocol-fixtures|mobile)(?:\/|$)/.test(path),
  );
  assert.deepEqual(forbidden, [], "Test-only or former client modules reached the API bundle");
  for (const file of result.outputFiles) {
    assert.ok(!file.text.includes("https://exp.host/"), "Former provider endpoint reached the API");
  }
});
