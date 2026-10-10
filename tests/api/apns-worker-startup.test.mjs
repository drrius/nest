import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
const workerPath = fileURLToPath(new URL("../../apps/api/push-worker.mjs", import.meta.url));
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const key = privateKey.export({ type: "pkcs8", format: "pem" });
const fixture = {
  NEST_PUSH_WORKER_ENABLED: "true",
  NEST_SUPABASE_URL: "http://127.0.0.1:1",
  NEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  NEST_SUPABASE_PUSH_SECRET: "sb_secret_fixture",
  NEST_PUSH_SCHEDULER_TOKEN: "a".repeat(64),
  NEST_APNS_ENVIRONMENT: "sandbox",
  NEST_APNS_KEY_ID: "TESTKEY001",
  NEST_APNS_TEAM_ID: "TESTTEAM01",
  NEST_APNS_PRIVATE_KEY: key,
};

test("dedicated APNs process fails before listening for disabled, missing or invalid server configuration", () => {
  const cases = [
    [{ NEST_PUSH_WORKER_ENABLED: "false" }, "Push worker is disabled"],
    [{ NEST_APNS_ENVIRONMENT: undefined }, "Missing server configuration: NEST_APNS_ENVIRONMENT"],
    [{ NEST_APNS_ENVIRONMENT: "unknown" }, 'Expected "sandbox" | "production"'],
    [{ NEST_APNS_KEY_ID: undefined }, "Missing server configuration: NEST_APNS_KEY_ID"],
    [{ NEST_APNS_TEAM_ID: "bad" }, "Invalid APNs credentials"],
    [{ NEST_APNS_PRIVATE_KEY: undefined }, "Missing server configuration: NEST_APNS_PRIVATE_KEY"],
    [{ NEST_APNS_PRIVATE_KEY: "private-value-do-not-log" }, "Invalid APNs signing key"],
    [{ NEST_PUSH_SCHEDULER_TOKEN: "bad" }, "Push scheduler requires a separate random"],
    [{ NEST_PUSH_PORT: "0" }, "Invalid push worker port"],
  ];
  for (const [override, expected] of cases) {
    const env = { PATH: process.env.PATH, ...fixture, ...override };
    for (const name of Object.keys(env)) if (env[name] === undefined) delete env[name];
    const child = spawnSync(process.execPath, [workerPath], {
      env,
      timeout: 5000,
      encoding: "utf8",
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.ok(child.stderr.includes(expected), child.stderr);
    assert.ok(!child.stderr.includes("private-value-do-not-log"));
    assert.ok(!child.stderr.includes(key));
  }
});
