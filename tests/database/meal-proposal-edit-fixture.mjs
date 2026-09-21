import { fixture as approval, id, as, json, content } from "./meal-proposal-approval-fixture.mjs";
import { Schema } from "./recipe-selection-fixture.mjs";
import { MealProposalEdit } from "../../packages/contracts/src/meal-proposals.ts";
export { id, as, json, content };
export const editFiles = [
  "supabase/migrations/20260921064711_native_meal_proposal_edits.sql",
  "supabase/migrations/20260921064729_native_meal_proposal_edit_commands.sql",
];
export const editInput = (proposalId, patch = {}) => ({
  action: "replace",
  proposalId,
  expectedRevision: "2",
  entryId: id(950),
  ...patch,
});
export const replacement = (patch = {}) => {
  const entry = content().entries[0];
  entry.source.recipe.title = "Replacement soup";
  return { ...entry, ...patch };
};
export const editOutcome = (entry = replacement(), patch = {}) => ({
  workerId: id(890),
  entry,
  failure: null,
  ...patch,
});
export function savedSource(f) {
  f.db.sql(
    `update public.meal_definitions set nest_servings=2,nest_instructions='Simmer.' where id='${id(200)}'`,
  );
  const revision = f.db.sql(
    `select revision from public.nest_meal_library_revisions where household_id='${id(10)}'`,
  );
  const recipe = JSON.parse(
    f.db.sql(as(`select public.nest_saved_meal('${id(10)}','${id(200)}','${revision}')`)),
  ).recipe;
  return { kind: "saved", libraryRevision: revision, recipe };
}
export function fixture(t) {
  const f = approval(t);
  for (const file of editFiles) f.db.file(file);
  const decode = (text) =>
    Schema.decodeUnknownSync(MealProposalEdit)(JSON.parse(text), { onExcessProperty: "error" });
  const beginEditCommand = (op, input, scope = {}) =>
    as(
      `select public.nest_begin_proposal_edit('${scope.home ?? id(10)}','${op}',${json(input)})`,
      scope.actor,
    );
  const claimEditCommand = (op, worker = id(890), actor = id(1)) =>
    `set role service_role; select public.nest_claim_proposal_edit('${actor}','${id(10)}','${op}','${worker}')`;
  const finishEditCommand = (op, value = editOutcome(), actor = id(1)) =>
    `set role service_role; select public.nest_finish_proposal_edit('${actor}','${id(10)}','${op}',${json(value)})`;
  return {
    ...f,
    beginEditCommand,
    claimEditCommand,
    finishEditCommand,
    beginEdit: (...args) => decode(f.db.sql(beginEditCommand(...args))),
    claimEdit: (...args) => JSON.parse(f.db.sql(claimEditCommand(...args))),
    finishEdit: (...args) => decode(f.db.sql(finishEditCommand(...args))),
    readEdit: (op, actor = id(1)) =>
      decode(f.db.sql(as(`select public.nest_read_proposal_edit('${id(10)}','${op}')`, actor))),
  };
}
