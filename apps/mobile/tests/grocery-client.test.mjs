import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { groceryClient } from "../src/groceries/client.ts";
import { ChoreFailure } from "../src/chores/client.ts";
import { account, target, operation } from "./offline-fixture.mjs";
const credentials = Effect.succeed({ access_token: "fixture", user: { id: account.actor } });
const client = groceryClient("https://fixture.invalid/", account, credentials);
const command = {
  operationId: operation,
  itemId: target,
  expectedVersion: "9007199254740993",
  checked: true,
};
const receipt = {
  operation,
  target,
  version: "9007199254740994",
  checked: true,
  outcome: "applied",
};
const envelope = { version: 1, householdId: account.household, receipt };
const run = (effect, response) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(FetchHttpClient.Fetch, async () => response)),
  );

test("native grocery transport binds token and household without coercing versions", async () => {
  const result = await Effect.runPromise(
    client.check(command).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async (url, options) => {
        assert.equal(new URL(url).pathname, "/v1/groceries/check");
        assert.equal(options.headers.authorization, "Bearer fixture");
        assert.equal(options.headers["x-nest-household"], account.household);
        assert.equal(options.redirect, "error");
        const sent = JSON.parse(new TextDecoder().decode(options.body));
        assert.equal(sent.expectedVersion, command.expectedVersion);
        assert.equal(sent.operationId, operation);
        return Response.json(envelope);
      }),
    ),
  );
  assert.equal(result.version, "9007199254740994");
});

test("wrong household, operation, state and numeric receipts cannot acknowledge native intent", async () => {
  for (const body of [
    { ...envelope, householdId: account.actor },
    { ...envelope, receipt: { ...receipt, operation: account.actor } },
    { ...envelope, receipt: { ...receipt, checked: false } },
    { ...envelope, receipt: { ...receipt, version: 2 } },
  ])
    await assert.rejects(
      run(client.check(command), Response.json(body)),
      (error) => error.code === "unavailable",
    );
});

test("native recovery codes distinguish removed/conflict, session loss and temporary availability", async () => {
  for (const [status, code] of [
    [400, "invalid"],
    [401, "session"],
    [403, "forbidden"],
    [409, "conflict"],
    [410, "removed"],
    [503, "unavailable"],
  ])
    await assert.rejects(
      run(client.check(command), new Response(null, { status })),
      (error) => error.code === code,
    );
});

test("actor switches never fetch and credential refresh outages stay availability failures", async () => {
  let fetched = false;
  for (const [auth, code] of [
    [Effect.succeed({ access_token: "other", user: { id: account.household } }), "session"],
    [Effect.fail(new ChoreFailure({ code: "unavailable" })), "unavailable"],
  ]) {
    const bound = groceryClient("https://fixture.invalid/", account, auth);
    await assert.rejects(
      Effect.runPromise(
        bound.list().pipe(
          Effect.provideService(FetchHttpClient.Fetch, async () => {
            fetched = true;
            return Response.json({});
          }),
        ),
      ),
      (error) => error.code === code,
    );
  }
  assert.equal(fetched, false);
});
