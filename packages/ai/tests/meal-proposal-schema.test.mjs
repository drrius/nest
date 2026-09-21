import assert from "node:assert/strict";
import { test } from "node:test";
import { effectSchema } from "../src/schema.ts";
import {
  GenerateMealProposalInput,
  ReplaceProposalMealInput,
  ChooseProposalRecipeInput,
} from "../../contracts/src/meal-proposals.ts";
const id = "abcdef00-0000-4000-8000-000000000001";
test("SDK proposal adapters preserve native contracts and reject model-supplied approval or identity", async () => {
  const cases = [
    [
      GenerateMealProposalInput,
      { weekStart: "2030-01-07", expectedWeekRevision: "9007199254740993", familiarOnly: true },
    ],
    [ReplaceProposalMealInput, { proposalId: id, expectedRevision: "2", entryId: id }],
    [
      ChooseProposalRecipeInput,
      {
        proposalId: id,
        expectedRevision: "2",
        entryId: id,
        definitionId: id,
        expectedLibraryRevision: "9007199254740993",
      },
    ],
  ];
  for (const [contract, input] of cases) {
    const schema = effectSchema(contract);
    assert.ok(schema.jsonSchema);
    assert.deepEqual(await schema.validate(input), { success: true, value: input });
    for (const patch of [
      { approved: true },
      { actorId: id },
      { operationId: id },
      { hiddenRecipe: {} },
    ])
      assert.equal((await schema.validate({ ...input, ...patch })).success, false);
  }
});
