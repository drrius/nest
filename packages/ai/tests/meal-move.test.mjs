import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
test("move tool advertises no caller identity and enforces cross-field week and bigint rules", async () => {
  const adapter = effectSchema(AssistantInputs.moveMeal);
  const schema = await adapter.jsonSchema;
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "date",
    "entryId",
    "expectedSourceRevision",
    "expectedTargetRevision",
    "slot",
    "sourceWeekStart",
    "targetWeekStart",
  ]);
  assert.equal(schema.additionalProperties, false);
  const input = {
    sourceWeekStart: "2026-10-05",
    expectedSourceRevision: "9007199254740993",
    targetWeekStart: "2026-10-12",
    expectedTargetRevision: "2",
    date: "2026-10-13",
    slot: "dinner",
    entryId: "abcdef00-0000-4000-8000-000000000001",
  };
  assert.deepEqual(await adapter.validate(input), { success: true, value: input });
  for (const patch of [
    { operationId: "model-retry" },
    { actorId: "model-actor" },
    { entryId: "bad" },
    { sourceWeekStart: "2026-10-06" },
    { expectedSourceRevision: "9223372036854775808" },
    { householdId: "hidden" },
    { date: "2026-10-19" },
    { targetWeekStart: "2026-10-05", date: "2026-10-06" },
    { expectedTargetRevision: "03" },
  ])
    assert.equal((await adapter.validate({ ...input, ...patch })).success, false);
});
