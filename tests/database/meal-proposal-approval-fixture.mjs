import {
  fixture as worker,
  id,
  as,
  week,
  json,
  content,
  outcome,
} from "./meal-proposal-worker-fixture.mjs";
import { Schema } from "./recipe-selection-fixture.mjs";
import { MealProposalApprovalReceipt } from "../../packages/contracts/src/meal-proposals.ts";
import { PlannedRecipeEnvelope } from "../../packages/contracts/src/recipe-selection.ts";
export { id, as, week, json, content, outcome };
export const approvalFiles = [
  "supabase/migrations/20260921043035_native_one_off_recipe_snapshots.sql",
  "supabase/migrations/20260921060649_native_meal_proposal_approval.sql",
];
export const target = (proposal, patch = {}) => ({
  proposalId: proposal,
  expectedRevision: "2",
  ...patch,
});
export function fixture(t) {
  const f = worker(t);
  for (const file of approvalFiles) f.db.file(file);
  const command = (operation, value, scope = {}) =>
    as(
      `select public.nest_approve_meal_proposal('${scope.home ?? id(10)}','${operation}',${json(value)})`,
      scope.actor,
    );
  const approve = (operation, value, scope) =>
    Schema.decodeUnknownSync(MealProposalApprovalReceipt)(
      JSON.parse(f.db.sql(command(operation, value, scope))),
      { onExcessProperty: "error" },
    );
  const ready = (operation = id(800), body = content(), actor = id(1)) => {
    const revision = f.baseline(id(700)).expectedRevision;
    const p = f.begin(
      operation,
      { weekStart: week, expectedWeekRevision: revision, familiarOnly: body.familiarOnly },
      actor,
    ).proposalId;
    f.claim(p, id(850), actor);
    f.finish(p, outcome(body), actor);
    return p;
  };
  const recipe = (entry, revision, actor = id(1)) =>
    Schema.decodeUnknownSync(PlannedRecipeEnvelope)(
      JSON.parse(
        f.db.sql(
          as(
            `select public.nest_planned_recipe('${id(10)}','${week}','${revision}','${entry}')`,
            actor,
          ),
        ),
      ),
      { onExcessProperty: "error" },
    );
  return { ...f, approveCommand: command, approve, ready, recipe };
}
