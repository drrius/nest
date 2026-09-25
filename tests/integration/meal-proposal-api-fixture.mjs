import { createRequire } from "node:module";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { recipeSelectionFiles } from "../database/recipe-selection-fixture.mjs";
import { workerFiles, id } from "../database/meal-proposal-worker-fixture.mjs";
import { editFiles } from "../database/meal-proposal-edit-fixture.mjs";
import { approvalFiles } from "../database/meal-proposal-approval-fixture.mjs";
import { migration, input } from "../database/meal-proposal-reservation-fixture.mjs";
import { seed } from "../database/meal-planning-context-fixture.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
export { id };
export { model } from "../api/meal-generation-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
export const Redacted = require("effect/Redacted");
const files = [
  ...recipeSelectionFiles,
  "supabase/migrations/20260920041525_native_food_preferences.sql",
  "supabase/migrations/20260920050551_native_cooking_preferences.sql",
  "supabase/migrations/20260921040437_native_meal_planning_context.sql",
  migration,
  ...workerFiles,
  ...approvalFiles,
  ...editFiles,
  "supabase/migrations/20260921072749_native_meal_proposal_handoff.sql",
  "supabase/migrations/20260925194847_native_meal_proposal_origin_read.sql",
  "supabase/migrations/20260925195418_native_meal_edit_snapshot.sql",
  "supabase/migrations/20260919214955_native_busy_snapshots.sql",
];
export const command = (operation = 800) => ({ operationId: id(operation), ...input() });
export function client(remote, model, options = {}) {
  const { bearer = remote.bearer, ...settings } = options;
  const handler = createHandler(
    { url: remote.url, publishableKey: "sb_publishable_fixture" },
    {
      model,
      planningSecret: Redacted.make(remote.serverKey),
      ...settings,
    },
  );
  return (path, input, signal) =>
    handler(
      new Request(`http://nest.local/v1/meals/proposal${path}`, {
        method: input === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "x-nest-household": id(10),
          "content-type": "application/json",
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        signal,
      }),
    );
}
export async function fixture(t) {
  const remote = await postgrestFixture(t, files);
  seed(remote.db);
  remote.db.sql(
    `update public.meal_definitions set nest_servings=2,nest_instructions='Simmer.' where id='${id(200)}'`,
  );
  remote.db.file("tests/integration/food-postgrest.sql");
  return remote;
}
