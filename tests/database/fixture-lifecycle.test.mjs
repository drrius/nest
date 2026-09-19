import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixtureLifecycle } from "./fixture-lifecycle.mjs";

function cluster(t, failFast = false) {
  const directory = mkdtempSync(join(tmpdir(), "nest-lifecycle-"));
  const data = join(directory, "data");
  const calls = [];
  const run = (command, args) => {
    calls.push(args);
    if (failFast && args.includes("fast")) throw new Error("Injected stop failure");
    return execFileSync(join(process.env.NEST_TEST_PG_BIN, command), args, {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  };
  const lifecycle = fixtureLifecycle(run, data, directory);
  t.after(lifecycle.stop);
  run("initdb", ["-D", data, "--auth=trust", "--no-locale"]);
  const start = () => {
    lifecycle.starting();
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      join(directory, "server.log"),
      "-o",
      `-k ${directory} -h '' -p 55439`,
      "start",
    ]);
  };
  return { directory, data, calls, lifecycle, start, run };
}

test("an attempted startup is shut down even when its caller reports failure after spawning", (t) => {
  const c = cluster(t);
  try {
    c.start();
    throw new Error("Injected startup timeout after spawn");
  } catch {
    c.lifecycle.stop();
  }
  assert.equal(existsSync(c.directory), false);
  assert.ok(c.calls.some((args) => args.includes("stop")));
});

test("failed fast shutdown falls back to immediate shutdown before removing data", (t) => {
  const c = cluster(t, true);
  c.start();
  c.lifecycle.stop();
  assert.ok(c.calls.some((args) => args.includes("immediate")));
  assert.equal(existsSync(c.directory), false);
});

test("cleanup handles a failed startup with no server process", (t) => {
  const c = cluster(t);
  c.lifecycle.starting();
  c.lifecycle.stop();
  assert.equal(existsSync(c.directory), false);
});
