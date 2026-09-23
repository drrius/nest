import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readLatestDailySummary } from "../../apps/api/src/notifications/latest-summary.ts";
import { notificationClient } from "../../apps/mobile/src/notifications/client.ts";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Http = require("effect/unstable/http/FetchHttpClient");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "First" },
  token: "fixture",
};
const empty = { version: 1, householdId: id(10), recipientId: id(1), latest: null };
const client = notificationClient(
  "http://localhost/",
  { actor: id(1), household: id(10) },
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const run = (effect, value) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Http.Fetch, async () => Response.json(value))),
  );
test("latest-summary API and native decoders reject identity substitution and excess private data", async () => {
  const service = readLatestDailySummary(
    { url: "http://localhost/", publishableKey: "fixture" },
    caller,
  );
  for (const effect of [service, client.latestSummary()]) {
    assert.deepEqual(await run(effect, empty), empty);
    for (const value of [
      { ...empty, recipientId: id(2) },
      { ...empty, householdId: id(11) },
      { ...empty, privateNotes: "secret" },
    ])
      await assert.rejects(run(effect, value));
  }
});
test("latest-summary handoff rereads current Today identity and rejects failed or malformed outputs", () => {
  const part = {
    type: "tool-readLatestDailySummary",
    state: "output-available",
    output: { ok: true, value: empty },
  };
  assert.deepEqual(actionResult(part), {
    label: "Open Today to find your current saved summary",
    href: "/household",
  });
  assert.equal(actionResult({ ...part, state: "input-available" }), null);
  assert.equal(actionResult({ ...part, output: { ok: false, code: "forbidden" } }), null);
  assert.equal(
    actionResult({ ...part, output: { ok: true, value: { ...empty, secret: true } } }),
    null,
  );
});
