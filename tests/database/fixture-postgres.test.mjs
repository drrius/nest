import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import test from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

test("stalled queries have a database timeout and cleanup is idempotent", async () => {
  const db = startFixturePostgres();
  const directory = dirname(db.sql("show data_directory"));
  try {
    await assert.rejects(db.concurrent("select pg_sleep(20)"), /statement timeout/);
  } finally {
    db.stop();
    db.stop();
  }
  assert.equal(existsSync(directory), false);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`${signal} stops the fixture server and removes its data`, async () => {
    const module = new URL("./fixture-postgres.mjs", import.meta.url).href;
    const source = `import { startFixturePostgres } from ${JSON.stringify(module)};
      const db = startFixturePostgres();
      console.log(db.sql('show data_directory'));
      setInterval(() => {}, 1000);`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    const guard = setTimeout(() => child.kill("SIGKILL"), 15000);
    try {
      const [output] = await once(child.stdout, "data");
      const directory = dirname(output.toString().trim());
      assert.equal(existsSync(directory), true);
      child.kill(signal);
      const [code] = await exited;
      assert.equal(code, signal === "SIGINT" ? 130 : 143);
      assert.equal(existsSync(directory), false);
    } finally {
      clearTimeout(guard);
      if (child.exitCode === null) child.kill("SIGTERM");
    }
  });
}
