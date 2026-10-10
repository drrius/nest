import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { notificationClient } from "../src/notifications/client.ts";
import { NotificationRuntime } from "../src/notifications/runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: account.actor }, access_token: "fixture" });
const client = notificationClient("https://fixture.invalid/", account, credentials);
const preferences = {
  dailySummaryEnabled: true,
  dailySummaryTime: "08:00",
  itemRemindersEnabled: false,
};
const command = { operationId: id(100), expectedRevision: "0", preferences };
const read = {
  version: 1,
  actorId: account.actor,
  timeZone: "Europe/Zurich",
  householdId: account.household,
  profile: { revision: "1", preferences },
};
const receipt = {
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  revision: "1",
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("notification client accepts owner-private state but rejects another household or account credentials", async () => {
  assert.deepEqual(await run(client.read(), async () => Response.json(read)), read.profile);
  for (const invalid of [
    { ...read, householdId: id(20) },
    { ...read, actorId: id(2) },
    { ...read, timeZone: "UTC" },
    { ...read, profile: { revision: "0", preferences } },
    { ...read, profile: { revision: "1", preferences: { ...preferences, calorieGoal: 2200 } } },
  ])
    await assert.rejects(
      run(client.read(), async () => Response.json(invalid)),
      { code: "unavailable" },
    );
  const other = notificationClient(
    "https://fixture.invalid/",
    account,
    Effect.succeed({ user: { id: id(2) }, access_token: "other" }),
  );
  await assert.rejects(
    run(other.read(), async () => assert.fail("wrong actor dispatched")),
    { code: "session" },
  );
});
test("notification client saves the exact command and binds its receipt to the submitting member", async () => {
  assert.deepEqual(
    await run(client.save(command), async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), command);
      assert.equal(init.redirect, "error");
      assert.equal(new Headers(init.headers).get("x-nest-household"), account.household);
      return Response.json({ version: 1, receipt });
    }),
    receipt,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { revision: "2" },
    { operationId: id(101) },
  ])
    await assert.rejects(
      run(client.save(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(
      client.save({ ...command, preferences: { ...preferences, dailySummaryTime: "08:00\n" } }),
      async () => assert.fail("invalid dispatch"),
    ),
    { code: "invalid" },
  );
});
test("notification runtime keeps immutable input after an uncertain save", async () => {
  const calls = [];
  let canonical = null;
  const runtime = new NotificationRuntime(
    {
      read: () => Effect.succeed(canonical),
      save: (input) => {
        calls.push(input);
        return calls.length === 1
          ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
          : Effect.succeed(receipt);
      },
    },
    () => id(100),
  );
  await runtime.load();
  const draft = { ...preferences };
  await runtime.save(draft);
  draft.dailySummaryTime = "19:30";
  await runtime.save(draft);
  assert.equal(calls.length, 1);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  canonical = {
    revision: "2",
    preferences: {
      dailySummaryEnabled: false,
      dailySummaryTime: "19:30",
      itemRemindersEnabled: true,
    },
  };
  await runtime.retry();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].preferences.dailySummaryTime, "08:00");
  assert.deepEqual(runtime.getSnapshot().profile, canonical);
  runtime.dispose();
  assert.equal(runtime.getSnapshot().profile, null);
});

test("summary wall-clock picker preserves every minute regardless of device timezone", async () => {
  const { pickerTime, summaryTime } = await import("../src/notifications/time.ts");
  for (let n = 0; n < 1440; n++) {
    const text = `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    assert.equal(summaryTime(pickerTime(text)), text);
  }
  for (const text of ["24:00", "08:00\n", "8:00", ""])
    assert.throws(() => pickerTime(text), RangeError);
  assert.equal(summaryTime(new Date(NaN)), null);
});
