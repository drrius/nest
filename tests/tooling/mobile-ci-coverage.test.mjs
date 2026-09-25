import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";

test("CI selects every root mobile unit test exactly once", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const selections = new Map();
  // These are the actual focused commands invoked by the current simple workflow.
  // Fail on uncovered files if a workflow refactor changes that invocation format.
  const commands = [...workflow.matchAll(/^\s+- run: pnpm (test:[\w-]+)\s*$/gm)];
  assert.ok(commands.length > 0, "No focused CI test commands found");
  for (const [, name] of commands) {
    assert.equal(typeof scripts[name], "string", `Missing CI script: ${name}`);
    for (const pattern of scripts[name].split(/\s+/)) {
      if (!pattern.startsWith("apps/mobile/tests/") || !pattern.endsWith(".test.mjs")) continue;
      const files = globSync(pattern);
      assert.ok(files.length > 0, `Empty mobile test selection in ${name}: ${pattern}`);
      for (const file of files) selections.set(file, (selections.get(file) ?? 0) + 1);
    }
  }
  const files = globSync("apps/mobile/tests/*.test.mjs");
  assert.ok(files.length > 0, "No root mobile unit tests found");
  assert.deepEqual(
    files.filter((file) => !selections.has(file)),
    [],
    "Mobile tests omitted by CI",
  );
  assert.deepEqual(
    [...selections].filter(([, count]) => count !== 1),
    [],
    "Mobile tests selected more than once",
  );
});
