import { createRequire } from "node:module";
import { generateMealContent } from "../../apps/api/src/meal-planning/generate.ts";
const apiRequire = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const aiRequire = createRequire(new URL("../../packages/ai/package.json", import.meta.url));
export const Effect = apiRequire("effect/Effect");
export const { MockLanguageModelV4 } = aiRequire("ai/test");
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const recipe = {
  definitionId: id(200),
  title: "Carrot soup",
  servings: 2,
  instructions: "Simmer until tender.",
  notes: null,
  recipeUrl: null,
  ingredients: [
    {
      ingredientId: id(300),
      name: "Carrots",
      quantity: "500",
      unit: "g",
      categoryId: null,
      note: null,
      order: 0,
    },
  ],
};
export function input() {
  return {
    context: {
      version: 1,
      actorId: id(1),
      householdId: id(10),
      stateHash: "a".repeat(64),
      members: [
        {
          actorId: id(1),
          profile: {
            revision: "1",
            restrictions: ["No peanuts"],
            dislikes: ["Celery"],
            portions: 1,
          },
        },
        {
          actorId: id(2),
          profile: { revision: "2", restrictions: ["Vegetarian"], dislikes: [], portions: 1.5 },
        },
      ],
      requesterCalorieGoal: 1900,
      cooking: {
        revision: "1",
        preferences: { cookingNotes: "Quick meals", mealSlots: ["dinner"] },
      },
    },
    week: {
      version: 1,
      householdId: id(10),
      weekStart: "2030-01-07",
      revision: "9007199254740993",
      entries: [],
    },
    familiarOnly: false,
    library: { revision: "9007199254740994", recipes: [structuredClone(recipe)] },
    busy: { version: 1, householdId: id(10), snapshots: [] },
  };
}
export const response = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  finishReason: { unified: "stop", raw: undefined },
  usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  warnings: [],
});
export function model(change = (value) => value) {
  const calls = [];
  const instance = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const data = JSON.parse(options.prompt.at(-1).content[0].text);
      calls.push({ options, data });
      const output =
        calls.length === 1
          ? {
              meals: data.slots.map((slot) => ({
                ...slot,
                choice: { kind: "saved", definitionId: id(200) },
                estimatedCaloriesPerServing: 300,
              })),
            }
          : { checks: data.meals.map(({ date, slot }) => ({ date, slot, result: "safe" })) };
      return response(await change(output, calls.length, data));
    },
  });
  return { instance, calls };
}
export function run(fixture, value = input(), options) {
  let next = 500;
  return Effect.runPromise(
    generateMealContent(fixture.instance, value, () => id(next++)),
    options,
  );
}
