import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
const id = "00000000-0000-4000-8000-000000000001";
test("SDK selection schemas preserve exact native revisions and reject injected identities or content", async () => {
  const base = {
    definitionId: id,
    weekStart: "2030-01-07",
    date: "2030-01-07",
    slot: "dinner",
    expectedRevision: "9007199254740993",
    expectedLibraryRevision: "9007199254740994",
  };
  for (const action of ["placeRecipe", "replaceWithRecipe"]) {
    const adapter = effectSchema(AssistantInputs[action]),
      input = action === "replaceWithRecipe" ? { ...base, entryId: id } : base;
    const json = await adapter.jsonSchema;
    assert.equal(json.additionalProperties, false);
    assert.equal(json.properties.expectedRevision.type, "string");
    assert.equal(Object.hasOwn(json.properties, "operationId"), false);
    assert.deepEqual(await adapter.validate(input), { success: true, value: input });
    for (const patch of [
      { actorId: id },
      { operationId: id },
      { title: "Fake" },
      { ingredients: [] },
      { date: "2030-01-14" },
      { expectedLibraryRevision: "-1" },
      { definitionId: "bad" },
    ])
      assert.equal((await adapter.validate({ ...input, ...patch })).success, false);
  }
});
