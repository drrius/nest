import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
test("replacement tool advertises no caller identity and enforces cross-field week and bigint rules", async () => {
  const adapter = effectSchema(AssistantInputs.replaceMeal);
  const schema = await adapter.jsonSchema;
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "date",
    "entryId",
    "expectedRevision",
    "slot",
    "title",
    "weekStart",
  ]);
  assert.equal(schema.additionalProperties, false);
  const input = {
    date: "2026-10-06",
    slot: "lunch",
    title: "Soup",
    weekStart: "2026-10-05",
    expectedRevision: "9007199254740993",
    entryId: "abcdef00-0000-4000-8000-000000000001",
  };
  assert.deepEqual(await adapter.validate(input), { success: true, value: input });
  for (const patch of [
    { operationId: "model-retry" },
    { actorId: "model-actor" },
    { entryId: "bad" },
    { weekStart: "2026-10-06" },
    { expectedRevision: "9223372036854775808" },
    { householdId: "hidden" },
    { date: "2026-10-12" },
    { title: " " },
    { expectedRevision: "9223372036854775806" },
  ])
    assert.equal((await adapter.validate({ ...input, ...patch })).success, false);
});
