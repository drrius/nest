import {
  input as planning,
  id,
  recipe,
  response,
  Effect,
  MockLanguageModelV4,
} from "./meal-generation-fixture.mjs";
import { generateSingleMeal } from "../../apps/api/src/meal-planning/generate-single-meal.ts";
export { id, recipe, Effect };
export function input() {
  const value = planning();
  return {
    planning: value,
    entryId: id(501),
    selection: null,
    envelope: {
      version: 1,
      actorId: id(1),
      householdId: id(10),
      proposal: {
        proposalId: id(800),
        revision: "2",
        weekStart: value.week.weekStart,
        weekRevision: value.week.revision,
        familiarOnly: false,
        status: "ready",
        expiresAt: Date.now() + 86400000,
        failure: null,
        entries: Array.from({ length: 7 }, (_, n) => ({
          entryId: id(500 + n),
          date: `2030-01-${String(7 + n).padStart(2, "0")}`,
          slot: "dinner",
          estimatedCaloriesPerServing: 400,
          source: {
            kind: "saved",
            libraryRevision: "1",
            recipe: { ...structuredClone(recipe), definitionId: id(201), title: "Previous meal" },
          },
        })),
      },
    },
  };
}
export function model(change = (value) => value) {
  const calls = [];
  const instance = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const data = JSON.parse(options.prompt.at(-1).content[0].text);
      calls.push({ data, options });
      const value = data.slots
        ? {
            meals: data.slots.map((slot) => ({
              ...slot,
              choice: { kind: "saved", definitionId: id(200) },
              estimatedCaloriesPerServing: 300,
            })),
          }
        : { checks: data.meals.map(({ date, slot }) => ({ date, slot, result: "safe" })) };
      return response(await change(value, calls.length, data, options));
    },
  });
  return { instance, calls };
}
export const run = (provider, value = input(), options) =>
  Effect.runPromise(generateSingleMeal(provider.instance, value), options);
