import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("deployed bundle boots without workspace modules and retains the member gate", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "nest-deployment-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, "runtime.mjs");
  execFileSync(process.execPath, ["build.mjs", output], {
    cwd: new URL("../../apps/api/", import.meta.url),
    stdio: "pipe",
  });
  const { runtimeHandler } = await import(pathToFileURL(output).href);
  const handler = runtimeHandler({
    NEST_SUPABASE_URL: "https://fixture.example",
    NEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  });
  assert.equal((await handler(new Request("https://nest.example/v1/session"))).status, 401);
  assert.equal(
    (await handler(new Request("https://nest.example/v1/chores", { method: "POST" }))).status,
    405,
  );
});
