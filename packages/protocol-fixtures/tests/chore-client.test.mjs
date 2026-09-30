import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { choreClient } from "../src/chores/client.ts";
import { account, operation, target } from "./offline-fixture.mjs";
const credentials = { access_token: "fixture-token", user: { id: account.actor } };
const command = {
  operationId: operation,
  occurrenceId: target,
  expectedDueDate: "2026-09-20",
  completedOn: "2026-09-20",
};
const client = choreClient("https://api.example/", account, Effect.succeed(credentials));
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("the native client sends the authenticated shared command and rejects a mismatched receipt", async () => {
  let headers, body, redirect;
  const fetch = async (_input, init) => {
    headers = new Headers(init.headers);
    body = JSON.parse(init.body);
    redirect = init.redirect;
    return Response.json({
      version: 1,
      householdId: account.household,
      receipt: {
        ...command,
        version: 1,
        operationId: target,
        completedBy: account.actor,
        outcome: "completed",
      },
    });
  };
  await assert.rejects(run(client.complete(command), fetch), { code: "unavailable" });
  assert.deepEqual(body, command);
  assert.equal(headers.get("authorization"), "Bearer fixture-token");
  assert.equal(headers.get("x-nest-household"), account.household);
  assert.equal(redirect, "error");
});

test("auth, permission and conflict failures preserve their recovery meaning", async () => {
  for (const [status, code] of [
    [401, "session"],
    [403, "forbidden"],
    [409, "conflict"],
    [400, "invalid"],
    [503, "unavailable"],
  ]) {
    for (const action of [client.list(), client.complete(command)]) {
      await assert.rejects(
        run(action, async () => Response.json({}, { status })),
        { code },
      );
    }
  }
});

test("a cached command cannot use the next account's credentials", async () => {
  const changed = choreClient(
    "https://api.example/",
    account,
    Effect.succeed({ ...credentials, user: { id: target } }),
  );
  let calls = 0;
  await assert.rejects(
    run(changed.complete(command), async () => {
      calls++;
      return Response.json({});
    }),
    { code: "session" },
  );
  assert.equal(calls, 0);
});

test("malformed, duplicate or truncated oversized snapshots are not empty successful reads", async () => {
  const chore = { occurrenceId: target, title: "Plants", dueDate: "2026-09-20", assigneeId: null };
  for (const chores of [
    [{ ...chore, dueDate: "2026-02-30" }],
    [chore, chore],
    Array(201).fill(chore),
    null,
  ]) {
    await assert.rejects(
      run(client.list(), async () =>
        Response.json({ version: 1, householdId: account.household, chores }),
      ),
      { code: "unavailable" },
    );
  }
  assert.deepEqual(
    await run(client.list(), async () =>
      Response.json({ version: 1, householdId: account.household, chores: [] }),
    ),
    [],
  );
});

test("same-actor responses from another household cannot enter this session's snapshot or receipts", async () => {
  await assert.rejects(
    run(client.list(), async () => Response.json({ version: 1, householdId: target, chores: [] })),
    { code: "unavailable" },
  );
  await assert.rejects(
    run(client.complete(command), async () =>
      Response.json({
        version: 1,
        householdId: target,
        receipt: { ...command, version: 1, completedBy: account.actor, outcome: "completed" },
      }),
    ),
    { code: "unavailable" },
  );
});
