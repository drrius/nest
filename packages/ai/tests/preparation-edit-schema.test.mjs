import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
const id = "00000000-0000-4000-8000-000000000001";
test("SDK preparation edit schema rejects injected identity and preserves nested responsibility", async () => {
  const input = {
    routineId: id,
    expectedRoutineVersion: "2030-01-07T12:00:00.123456Z",
    entryId: id,
    weekStart: "2030-01-07",
    expectedRevision: "9007199254740993",
    patch: {
      title: "Soak",
      instructions: null,
      dueOn: "2030-01-06",
      assignment: { policy: "assigned", memberId: id },
    },
  };
  const adapter = effectSchema(AssistantInputs.editMealPreparation);
  const json = await adapter.jsonSchema;
  assert.equal(json.additionalProperties, false);
  assert.equal(json.properties.expectedRevision.type, "string");
  assert.equal(Object.hasOwn(json.properties, "operationId"), false);
  assert.deepEqual(await adapter.validate(input), { success: true, value: input });
  for (const patch of [
    { actorId: id },
    { operationId: id },
    { patch: { ...input.patch, dueOn: "2030-02-30" } },
    { patch: { ...input.patch, assignment: { policy: "shared", memberId: id } } },
    { expectedRevision: "-1" },
  ])
    assert.equal((await adapter.validate({ ...input, ...patch })).success, false);
});
