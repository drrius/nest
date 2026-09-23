import assert from "node:assert/strict";
import test from "node:test";
import * as Effect from "effect/Effect";
import { RecurringReadRuntime } from "../src/money/recurring-read-runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
test("recurring reads retry denial but retain verification until an authorized success", async () => {
  let error = "forbidden";
  const entry = { kind: "due-variable", value: { rules: [] } };
  const runtime = new RecurringReadRuntime(
    {
      read: () =>
        error ? Effect.fail(new PreferenceFailure({ code: error })) : Effect.succeed(entry),
    },
    { kind: "due-variable", after: null },
  );
  await runtime.setOnline(true);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().verify, true);
  error = "unavailable";
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().entry, null);
  error = null;
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, false);
  assert.deepEqual(runtime.getSnapshot().entry, entry);
  await runtime.setOnline(false);
  assert.equal(runtime.getSnapshot().entry, null);
  runtime.dispose();
});
