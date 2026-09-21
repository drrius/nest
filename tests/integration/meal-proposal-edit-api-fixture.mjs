import { fixture, client, model as weekModel, command, id } from "./meal-proposal-api-fixture.mjs";
import { model } from "../api/single-meal-generation-fixture.mjs";
export { fixture, client, model, id };
export const draft = {
  title: "Original soup",
  servings: 2,
  instructions: "Simmer until tender.",
  recipeUrl: null,
  notes: null,
  ingredients: [{ name: "Carrots", quantity: "200", unit: "g", categoryId: null, note: null }],
};
export async function ready(f) {
  const provider = weekModel((value) => {
    if (value.meals)
      value.meals.forEach((entry) => {
        entry.choice = { kind: "suggested", recipe: draft };
      });
    return value;
  });
  const response = await client(f, provider.instance)("/generate", command());
  if (response.status !== 200) throw new Error(await response.text());
  const { envelope } = await response.json();
  return {
    envelope,
    input: {
      action: "replace",
      operationId: id(880),
      proposalId: envelope.proposal.proposalId,
      expectedRevision: "2",
      entryId: envelope.proposal.entries[0].entryId,
    },
  };
}
export async function jsonOk(response) {
  if (response.status !== 200) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
