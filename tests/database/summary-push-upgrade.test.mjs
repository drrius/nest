import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixture } from "./summary-push-fixture.mjs";

const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);

function postgresClient() {
  const bin = process.env.NEST_TEST_PG_BIN;
  assert.ok(bin);
  for (const name of readdirSync(tmpdir()).filter((entry) => entry.startsWith("nest-db-"))) {
    const socket = join(tmpdir(), name, "socket");
    if (!existsSync(socket)) continue;
    const args = ["-X", "-h", socket, "-p", "55439", "-d", "postgres", "-qAt"];
    try {
      const found = execFileSync(join(bin, "psql"), [
        ...args,
        "-c",
        "select to_regclass('private.summary_push_upgrade_probe') is not null",
      ], { encoding: "utf8", timeout: 1000 }).trim();
      if (found === "t") return { bin, args };
    } catch {}
  }
  assert.fail("fixture PostgreSQL socket was not found");
}

test("a warmed journal wrapper dispatches summary claims after the additive migration", async (t) => {
  const f = fixture(t, (previous) => {
    previous.db.sql("create table private.summary_push_upgrade_probe(step text primary key)");
    const renewal = previous.prepare();
    const client = postgresClient();
    const child = spawn(join(client.bin, "psql"), [
      ...client.args,
      "-v", "ON_ERROR_STOP=1",
      "-c", `select private.nest_begin_push_delivery('${renewal}')`,
      "-c", "insert into private.summary_push_upgrade_probe values('warm')",
      "-c", `do $wait$ begin
        while not exists(select 1 from private.summary_push_upgrade_probe where step='continue') loop
          perform pg_sleep(0.02);
        end loop;
      end $wait$`,
      "-c", `select private.nest_begin_push_delivery(
        (select id from private.nest_push_deliveries where summary_id is not null)
      )`,
    ]);
    t.after(() => child.kill());
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    const result = new Promise((resolve) =>
      child.on("close", (code) => resolve({ stdout, stderr, code })),
    );
    for (let attempts = 0; attempts < 250; attempts++) {
      if (
        previous.db.sql(
          "select exists(select 1 from private.summary_push_upgrade_probe where step='warm')",
        ) === "t"
      )
        return result;
      pause();
    }
    assert.fail("persistent PostgreSQL session did not warm the journal wrapper");
  });
  const delivery = f.prepare();
  assert.ok(delivery);
  f.db.sql("insert into private.summary_push_upgrade_probe values('continue')");
  const result = await f.beforeSummaryResult;
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const claims = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map(JSON.parse);
  assert.equal(claims.length, 2);
  assert.equal(claims[1].deliveryId, delivery);
  assert.equal(claims[1].summaryId, f.summaryId);
  assert.equal(claims[1].outboxId, f.summaryId);
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "2");
});
