import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { archiveRecipe } from "../../apps/api/src/meals/recipe-archive.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const input = {
  operationId: "ABCDEF00-0000-4000-8000-000000000004",
  definitionId: "ABCDEF00-0000-4000-8000-000000000003",
  expectedRevision: "9007199254740993",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: input.operationId.toLowerCase(),
  definitionId: input.definitionId.toLowerCase(),
  revision: "9007199254740994",
};
const run = (value, fetch) =>
  Effect.runPromise(
    archiveRecipe(config, caller, value).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("archive sends canonical IDs and validates the exact bound bigint receipt", async () => {
  assert.deepEqual(
    await run(input, async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_archive_recipe");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: input.operationId.toLowerCase(),
        p_input: {
          definitionId: input.definitionId.toLowerCase(),
          expectedRevision: input.expectedRevision,
        },
      });
      return Response.json(receipt);
    }),
    receipt,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(8) },
    { definitionId: id(7) },
    { revision: "9007199254740993" },
    { revision: 9007199254740994 },
    { extra: true },
  ])
    await assert.rejects(
      run(input, async () => Response.json({ ...receipt, ...patch })),
      (e) => e.code === "unavailable",
    );
});
test("archive rejects hidden identities, exhausted revisions and malformed commands before transport", async () => {
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { expectedRevision: 1 },
    { expectedRevision: "9223372036854775807" },
    { definitionId: "bad" },
    { expectedRevision: "01" },
  ])
    await assert.rejects(
      run({ ...input, ...patch }, () => assert.fail("Invalid archive dispatched")),
      (e) => e.code === "invalid_request",
    );
  for (const [code, status, expected] of [
    ["40001", 409, "conflict"],
    ["42501", 403, "forbidden"],
    ["22023", 400, "invalid_request"],
  ])
    await assert.rejects(
      run(input, async () => Response.json({ code }, { status })),
      (e) => e.code === expected,
    );
});
