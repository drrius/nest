import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { foodClient } from "../src/food/client.ts";
import { ChoreFailure } from "../src/chores/client.ts";
import { parseFoodDraft } from "../src/food/draft.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: account.actor }, access_token: "fixture" });
const client = foodClient("https://fixture.invalid/", account, credentials);
const preferences = { restrictions: [], dislikes: [], calorieGoal: null, portions: 1 };
const command = { operationId: id(100), expectedRevision: "0", preferences };
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const read = { version: 1, actorId: account.actor, householdId: account.household, profile: null };
const receipt = {
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  revision: "1",
};
test("food client binds fresh credentials and rejects another account before network access", async () => {
  let calls = 0;
  for (const session of [
    Effect.succeed({ user: { id: id(2) }, access_token: "wrong" }),
    Effect.fail(new ChoreFailure({ code: "session" })),
  ]) {
    const api = foodClient("https://fixture.invalid/", account, session);
    for (const effect of [api.read(), api.save(command)])
      await assert.rejects(
        run(effect, async () => {
          calls++;
          return Response.json(read);
        }),
        { code: "session" },
      );
  }
  assert.equal(calls, 0);
});
test("food read validates owner, household, exact revision and schema while missing remains unconfigured", async () => {
  assert.equal(await run(client.read(), async () => Response.json(read)), null);
  for (const invalid of [
    { ...read, actorId: id(2) },
    { ...read, householdId: id(11) },
    { ...read, extra: true },
    ...["0", 1, "9223372036854775808"].map((revision) => ({
      ...read,
      profile: { revision, preferences },
    })),
  ])
    await assert.rejects(
      run(client.read(), async () => Response.json(invalid)),
      { code: "unavailable" },
    );
});
test("food save sends only the shared command and validates immutable acknowledgment identity", async () => {
  let sent;
  assert.deepEqual(
    await run(client.save(command), async (_url, init) => {
      sent = JSON.parse(init.body);
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      const headers = new Headers(init.headers);
      assert.equal(headers.get("authorization"), "Bearer fixture");
      assert.equal(headers.get("x-nest-household"), account.household);
      return Response.json({ version: 1, receipt });
    }),
    receipt,
  );
  assert.deepEqual(sent, command);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(11) },
    { operationId: id(101) },
    { revision: "2" },
    { revision: 1 },
  ])
    await assert.rejects(
      run(client.save(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.save({ ...command, preferences: { ...preferences, portions: 1.25 } }), async () =>
      assert.fail("invalid command dispatched"),
    ),
    { code: "invalid" },
  );
});
test("food request errors retain authentication, conflict and retry meanings", async () => {
  for (const [status, code] of [
    [401, "session"],
    [403, "forbidden"],
    [409, "conflict"],
    [400, "invalid"],
    [503, "unavailable"],
  ])
    await assert.rejects(
      run(client.save(command), async () => Response.json({}, { status })),
      { code },
    );
});
test("native food parsing keeps optional goals empty and rejects invalid portions, entries and numeric tricks", () => {
  const draft = {
    restrictions: " Peanuts \n\n Shellfish ",
    dislikes: "",
    calorieGoal: "",
    portions: 1.5,
  };
  assert.deepEqual(parseFoodDraft(draft).value, {
    restrictions: ["Peanuts", "Shellfish"],
    dislikes: [],
    calorieGoal: null,
    portions: 1.5,
  });
  for (const patch of [
    { calorieGoal: "1e3" },
    { calorieGoal: "0" },
    { calorieGoal: "1.5" },
    { calorieGoal: "20001" },
    { portions: 1.25 },
    { restrictions: "a\n".repeat(33) },
    { dislikes: "x".repeat(121) },
  ])
    assert.equal(parseFoodDraft({ ...draft, ...patch })._tag, "Failure");
});
