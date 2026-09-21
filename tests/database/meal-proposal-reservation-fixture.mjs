import { fixture as baseFixture, id, as, week } from "./meal-removal-fixture.mjs";
import { seed } from "./meal-planning-context-fixture.mjs";
import { createRequire } from "node:module";
import {
  MealProposalGenerationReceipt,
  MealProposalEnvelope,
  MealProposalDiscardReceipt,
} from "../../packages/contracts/src/meal-proposals.ts";
export { id, as, week };
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
export const migration = "supabase/migrations/20260921045011_native_meal_proposal_reservations.sql";
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const entries = [
  {
    entryId: id(950),
    date: week,
    slot: "dinner",
    estimatedCaloriesPerServing: null,
    source: {
      kind: "suggested",
      recipe: {
        title: "Soup",
        servings: 2,
        instructions: "Simmer.",
        recipeUrl: null,
        notes: null,
        ingredients: [
          { name: "Carrots", quantity: "500", unit: "g", categoryId: null, note: null },
        ],
      },
    },
  },
];
export const input = (patch = {}) => ({
  weekStart: week,
  expectedWeekRevision: "0",
  familiarOnly: false,
  ...patch,
});
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(JSON.parse(value), { onExcessProperty: "error" });
export function fixture(t) {
  const f = baseFixture();
  t?.after(() => f.db.stop());
  for (const file of [
    "supabase/migrations/20260920041525_native_food_preferences.sql",
    "supabase/migrations/20260920050551_native_cooking_preferences.sql",
    "supabase/migrations/20260921040437_native_meal_planning_context.sql",
    migration,
  ])
    f.db.file(file);
  seed(f.db);
  const command = (operation, value = input(), actor = id(1), home = id(10)) =>
    as(`select public.nest_begin_meal_proposal('${home}','${operation}',${json(value)})`, actor);
  const begin = (operation, value, actor, home) =>
    decode(MealProposalGenerationReceipt, f.db.sql(command(operation, value, actor, home)));
  const read = (proposal, actor = id(1), home = id(10)) =>
    decode(
      MealProposalEnvelope,
      f.db.sql(as(`select public.nest_read_meal_proposal('${home}','${proposal}')`, actor)),
    );
  const discardCommand = (operation, proposal, revision = "1", actor = id(1)) =>
    as(
      `select public.nest_discard_meal_proposal('${id(10)}','${operation}',${json({ proposalId: proposal, expectedRevision: revision })})`,
      actor,
    );
  const discard = (operation, proposal, revision, actor) =>
    decode(
      MealProposalDiscardReceipt,
      f.db.sql(discardCommand(operation, proposal, revision, actor)),
    );
  return { ...f, command, begin, read, discardCommand, discard };
}
