import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
import { files as preparationFiles } from "./ai-preparation-edit-fixture.mjs";
import { files as contextFiles, seed } from "./meal-planning-context-fixture.mjs";
import { migration, input } from "./meal-proposal-reservation-fixture.mjs";
import { workerFiles, content, outcome } from "./meal-proposal-worker-fixture.mjs";
import { approvalFiles } from "./meal-proposal-approval-fixture.mjs";
import { editFiles, editInput, replacement, editOutcome } from "./meal-proposal-edit-fixture.mjs";
export { id, as, json, input, content, editInput, replacement, editOutcome };
export const files = [
  ...new Set([
    ...preparationFiles,
    ...contextFiles.slice(1),
    migration,
    ...workerFiles,
    ...approvalFiles,
    ...editFiles,
    "supabase/migrations/20260921072749_native_meal_proposal_handoff.sql",
    "supabase/migrations/20260921074554_native_ai_meal_proposals.sql",
  ]),
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  seed(f.db);
  const command = (turn, tool, value, call = tool) =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(value)})`;
  const execute = (turn, tool, value, call) =>
    JSON.parse(f.db.sql(as(command(turn, tool, value, call), turn.actor)));
  const generate = (proposal) => {
    f.db.sql(
      `set role service_role; select public.nest_claim_meal_proposal('${id(1)}','${id(10)}','${proposal}','${id(850)}')`,
    );
    return JSON.parse(
      f.db.sql(
        `set role service_role; select public.nest_finish_meal_proposal('${id(1)}','${id(10)}','${proposal}',${json(outcome())})`,
      ),
    );
  };
  return { ...f, command, execute, generate };
}
