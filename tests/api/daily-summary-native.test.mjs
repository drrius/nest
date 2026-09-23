import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SummaryReadRuntime } from "../../apps/mobile/src/notifications/summary-runtime.ts";
import { summaryHandoff } from "../../apps/mobile/src/assistant/summary-handoff.ts";
import { PreferenceFailure } from "../../apps/mobile/src/preferences/client.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect");
const id = "00000000-0000-4000-8000-000000000001";
const snapshot = {
  version: 1,
  summaryId: id,
  summary: {
    version: 1,
    householdId: id,
    recipientId: id,
    date: "2028-03-01",
    ...Object.fromEntries(
      ["choresDue", "choresOverdue", "mealsPlanned", "renewalsDue", "cancellationDeadlines"].map(
        (key) => [key, { count: 0, more: false }],
      ),
    ),
  },
};
test("summary handoff validates output and creates only the fixed recipient-authorized route", () => {
  const part = { state: "output-available", output: { ok: true, value: snapshot } };
  assert.deepEqual(summaryHandoff(part).href, {
    pathname: "/daily-summary",
    params: { summaryId: id },
  });
  assert.equal(summaryHandoff({ ...part, state: "input-available" }), null);
  assert.equal(
    summaryHandoff({ ...part, output: { ...part.output, href: "https://example.com" } }),
    null,
  );
});
test("summary runtime discards late background reads and recovers authorization without remounting", async () => {
  let resolve;
  let mode = "wait";
  const runtime = new SummaryReadRuntime(
    {
      read: () =>
        mode === "wait"
          ? Effect.promise(
              () =>
                new Promise((done) => {
                  resolve = done;
                }),
            )
          : mode === "denied"
            ? Effect.fail(new PreferenceFailure({ code: "forbidden" }))
            : Effect.succeed(snapshot),
    },
    id,
  );
  await runtime.setOnline(true);
  const first = runtime.setActive(true);
  await new Promise((done) => setImmediate(done));
  await runtime.setActive(false);
  resolve(snapshot);
  await first;
  assert.equal(runtime.getSnapshot().entry, null);
  mode = "denied";
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().verify, true);
  mode = "ready";
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, false);
  assert.deepEqual(runtime.getSnapshot().entry, snapshot);
  await runtime.setOnline(false);
  assert.equal(runtime.getSnapshot().entry, null);
  runtime.dispose();
});
