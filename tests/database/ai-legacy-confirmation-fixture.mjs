import {
  files as previous,
  payload as original,
  as,
  id,
  json,
} from "./ai-legacy-dismissal-fixture.mjs";
import { payload as expense } from "./native-expense-helpers.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous,
  "supabase/migrations/20260922023409_native_legacy_draft_confirmation.sql",
  "supabase/migrations/20260922030816_native_legacy_confirmation_approval.sql",
  "supabase/migrations/20260922031907_native_ai_legacy_confirmation_proposal.sql",
];
export function payload(db) {
  return {
    ...original(db),
    expense: expense({ description: "Reviewed retained expense", note: "Explicit proposed terms" }),
  };
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files),
    input = payload(f.db);
  const command = (turn, input, call = "draft", tool = "proposeLegacyConfirmation") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
