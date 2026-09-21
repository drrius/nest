import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { editRecipe } from "../../apps/api/src/meals/recipe-edit.ts";
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
  patch: { title: "Updated soup" },
  ingredients: null,
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: input.operationId.toLowerCase(),
  definitionId: input.definitionId.toLowerCase(),
  previousRevision: input.expectedRevision,
  revision: "9007199254740994",
};
const run = (value, fetch) =>
  Effect.runPromise(
    editRecipe(config, caller, value).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("edit sends canonical IDs and validates the bound baseline and bounded bigint receipt", async () => {
  assert.deepEqual(
    await run(input, async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_edit_recipe");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: input.operationId.toLowerCase(),
        p_input: {
          definitionId: input.definitionId.toLowerCase(),
          expectedRevision: input.expectedRevision,
          patch: input.patch,
          ingredients: null,
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
    { previousRevision: "9007199254740992" },
    { revision: "9007199254740992" },
    { revision: "9007199254741395" },
    { revision: 9007199254740994 },
    { extra: true },
  ])
    await assert.rejects(
      run(input, async () => Response.json({ ...receipt, ...patch })),
      (e) => e.code === "unavailable",
    );
});
test("edit rejects hidden identities, malformed patches and invalid commands before transport", async () => {
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { expectedRevision: 1 },
    { expectedRevision: "9223372036854775808" },
    { definitionId: "bad" },
    { expectedRevision: "01" },
    { patch: { archived_at: null } },
    { patch: {} },
    { ingredients: [{ kind: "existing", ingredientId: id(300), patch: { operationId: id(8) } }] },
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

test("edit canonicalizes only provided ingredient IDs and category fields without inventing patches", async () => {
  const uuid = "ABCDEF00-0000-4000-8000-000000000300";
  const value = {
    ...input,
    ingredients: [
      { kind: "existing", ingredientId: uuid, patch: { categoryId: uuid } },
      { kind: "existing", ingredientId: id(301), patch: {} },
      { kind: "new", name: "Salt", quantity: null, unit: null, categoryId: uuid, note: null },
    ],
  };
  await run(value, async (_url, init) => {
    const { p_input } = JSON.parse(init.body);
    assert.deepEqual(p_input.ingredients, [
      {
        kind: "existing",
        ingredientId: uuid.toLowerCase(),
        patch: { categoryId: uuid.toLowerCase() },
      },
      value.ingredients[1],
      { ...value.ingredients[2], categoryId: uuid.toLowerCase() },
    ]);
    return Response.json(receipt);
  });
});
