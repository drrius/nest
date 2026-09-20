import assert from "node:assert/strict";
import { test } from "node:test";
import { AssistantInputs } from "../../contracts/src/assistant-actions.ts";
import { effectSchema } from "../src/schema.ts";
test("recipe tool exposes complete shared draft without caller or generated identities", async () => {
  const adapter = effectSchema(AssistantInputs.createRecipe),
    schema = await adapter.jsonSchema;
  assert.deepEqual(Object.keys(schema.properties).sort(), ["expectedRevision", "recipe"]);
  assert.equal(schema.additionalProperties, false);
  const input = {
    expectedRevision: "9007199254740993",
    recipe: {
      title: "Soup",
      servings: 2,
      instructions: "Simmer",
      notes: null,
      recipeUrl: null,
      ingredients: [{ name: "Tomato", quantity: "1/2", unit: "cup", note: null, categoryId: null }],
    },
  };
  assert.deepEqual(await adapter.validate(input), { success: true, value: input });
  for (const patch of [
    { actorId: "hidden" },
    { operationId: "hidden" },
    { householdId: "hidden" },
    { expectedRevision: "9223372036854775806" },
    { recipe: { ...input.recipe, definitionId: "hidden" } },
    { recipe: { ...input.recipe, servings: null } },
    { recipe: { ...input.recipe, instructions: " " } },
  ])
    assert.equal((await adapter.validate({ ...input, ...patch })).success, false);
});
