import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
test("archive tool exposes only a strict recipe target and library baseline", async () => {
  const adapter = effectSchema(AssistantInputs.archiveRecipe),
    schema = await adapter.jsonSchema;
  assert.deepEqual(Object.keys(schema.properties).sort(), ["definitionId", "expectedRevision"]);
  assert.equal(schema.additionalProperties, false);
  const value = {
    definitionId: "abcdef00-0000-4000-8000-000000000200",
    expectedRevision: "9007199254740993",
  };
  assert.deepEqual(await adapter.validate(value), { success: true, value });
  for (const patch of [
    { actorId: "hidden" },
    { operationId: "hidden" },
    { householdId: "hidden" },
    { expectedRevision: "9223372036854775807" },
    { expectedRevision: "01" },
    { definitionId: "invalid" },
  ])
    assert.equal((await adapter.validate({ ...value, ...patch })).success, false);
});
