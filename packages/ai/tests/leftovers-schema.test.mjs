import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
const id = "00000000-0000-4000-8000-000000000001";
test("SDK leftovers schema preserves exact week baselines and rejects model identities", async () => {
  const input = {
    entryId: id,
    sourceWeekStart: "2030-01-07",
    targetWeekStart: "2030-01-14",
    date: "2030-01-15",
    slot: "dinner",
    expectedSourceRevision: "9007199254740993",
    expectedTargetRevision: "0",
  };
  const adapter = effectSchema(AssistantInputs.placeLeftovers);
  const json = await adapter.jsonSchema;
  assert.equal(json.additionalProperties, false);
  assert.equal(json.properties.expectedSourceRevision.type, "string");
  assert.equal(Object.hasOwn(json.properties, "operationId"), false);
  assert.deepEqual(await adapter.validate(input), { success: true, value: input });
  for (const patch of [
    { actorId: id },
    { operationId: id },
    { ingredients: [] },
    { entryId: "bad" },
    { date: "2030-01-07" },
    { expectedTargetRevision: "-1" },
  ])
    assert.equal((await adapter.validate({ ...input, ...patch })).success, false);
});
