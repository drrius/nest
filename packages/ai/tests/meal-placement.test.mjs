import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
test("placement tool advertises no caller identity and enforces cross-field week and bigint rules", async () => {
  const adapter = effectSchema(AssistantInputs.placeMeal);
  const schema = await adapter.jsonSchema;
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "date",
    "expectedRevision",
    "slot",
    "title",
    "weekStart",
  ]);
  assert.equal(schema.additionalProperties, false);
  const input = {
    weekStart: "2026-10-05",
    expectedRevision: "9007199254740993",
    date: "2026-10-06",
    slot: "lunch",
    title: "Pasta",
  };
  assert.deepEqual(await adapter.validate(input), { success: true, value: input });
  for (const patch of [
    { operationId: "model-retry" },
    { actorId: "model-actor" },
    { date: "2026-10-12" },
    { weekStart: "2026-10-06" },
    { expectedRevision: "9223372036854775808" },
    { title: "🫒".repeat(61) },
  ])
    assert.equal((await adapter.validate({ ...input, ...patch })).success, false);
});
