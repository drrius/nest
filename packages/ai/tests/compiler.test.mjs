import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import test from "node:test";

test("AI package typechecking enforces Effect diagnostics", () => {
  const source = new URL(`../src/compiler-probe-${randomUUID()}.ts`, import.meta.url);
  try {
    writeFileSync(source, 'import * as Effect from "effect/Effect";\nEffect.log("probe");\n', {
      flag: "wx",
    });
    const result = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout + result.stderr, /effect\(floatingEffect\)/);
  } finally {
    unlinkSync(source);
  }
});
