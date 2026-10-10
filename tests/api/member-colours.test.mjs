import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { memberColours } from "../../apps/api/src/member-colours/service.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  token: "fixture-token",
  member: { userId: id(1), householdId: id(10), displayName: "Fixture" },
};
const service = memberColours(
  { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  caller,
);
const mine = { actorId: id(1), householdId: id(10), colour: "plum", revision: "2" };
const partner = { actorId: id(2), householdId: id(10), colour: "teal", revision: "1" };
const command = { operationId: id(100), expectedRevision: "2", colour: "rose" };
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  revision: "3",
  colour: "rose",
};
const execute = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const response = (value, range = "0-0/1") =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", "content-range": range },
  });

test("household colours are read for the caller's household only and returned without row scope", async () => {
  const result = await execute(service.read(), (url, init) => {
    const query = new URL(url).searchParams;
    assert.equal(new URL(url).pathname, "/rest/v1/nest_member_colours");
    assert.equal(query.get("household_id"), `eq.${id(10)}`);
    assert.equal(query.get("actor_id"), null);
    assert.equal(init.headers.authorization, "Bearer fixture-token");
    assert.equal(init.redirect, "error");
    return Promise.resolve(response([mine, partner], "0-1/2"));
  });
  assert.deepEqual(result, [
    { actorId: id(1), colour: "plum", revision: "2" },
    { actorId: id(2), colour: "teal", revision: "1" },
  ]);
  assert.deepEqual(await execute(service.read(), () => Promise.resolve(response([], "*/0"))), []);
});

test("colour reads reject foreign, duplicate, unknown or incomplete rows", async () => {
  const cases = [
    [[{ ...mine, householdId: id(20) }], "0-0/1"],
    [[mine, { ...partner, colour: "plum" }], "0-1/2"],
    [[mine, { ...mine, colour: "teal" }], "0-1/2"],
    [[{ ...mine, colour: "green" }], "0-0/1"],
    [[{ ...mine, revision: "0" }], "0-0/1"],
    [[{ ...mine, revision: 2 }], "0-0/1"],
    [[{ ...mine, email: "x" }], "0-0/1"],
    [[mine], "0-0/2"],
    [[mine, partner, { ...partner, actorId: id(3), colour: "rose" }], "0-2/3"],
    [[], "*/1"],
  ];
  for (const [rows, range] of cases)
    await assert.rejects(
      execute(service.read(), () => Promise.resolve(response(rows, range))),
      { code: "unavailable" },
    );
});

test("saves send only the caller's household and reject a mismatched receipt", async () => {
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { revision: "2" },
    { colour: "teal" },
  ])
    await assert.rejects(
      execute(service.save(command), () => Promise.resolve(response({ ...receipt, ...change }))),
      { code: "unavailable" },
    );
  const result = await execute(service.save(command), async (url, init) => {
    assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_save_member_colour");
    assert.deepEqual(JSON.parse(await new Response(init.body).text()), {
      p_household: id(10),
      p_operation: id(100),
      p_expected: "2",
      p_colour: "rose",
    });
    return response(receipt);
  });
  assert.deepEqual(result, receipt);
});

test("partner conflicts surface as conflict, not as a retryable failure", async () => {
  await assert.rejects(
    execute(service.save(command), () =>
      Promise.resolve(
        new Response(JSON.stringify({ code: "PT412", message: "Member colour taken" }), {
          status: 412,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
    { code: "conflict" },
  );
});

test("invalid colour commands fail before any request", async () => {
  for (const input of [
    { ...command, colour: "green" },
    { ...command, colour: "Rose" },
    { ...command, expectedRevision: "-1" },
    { ...command, actorId: id(2) },
    { ...command, householdId: id(20) },
    { operationId: "nope", expectedRevision: "0", colour: "rose" },
  ]) {
    let calls = 0;
    await assert.rejects(
      execute(service.save(input), () => {
        calls++;
        return Promise.resolve(response({}));
      }),
      { code: "invalid_request" },
    );
    assert.equal(calls, 0);
  }
});
