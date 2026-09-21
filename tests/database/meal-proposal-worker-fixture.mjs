import {
  fixture as reservation,
  id,
  as,
  week,
  json,
  entries,
} from "./meal-proposal-reservation-fixture.mjs";
import { recipeSelectionFiles, Schema } from "./recipe-selection-fixture.mjs";
import { mealRemovalFiles } from "./meal-removal-files.mjs";
import { MealProposalEnvelope } from "../../packages/contracts/src/meal-proposals.ts";
export { id, as, week, json };
export const workerFiles = [
  "supabase/migrations/20260921050419_native_meal_proposal_generation_recovery.sql",
  "supabase/migrations/20260921050717_native_meal_proposal_worker_commands.sql",
];
export function content(slots = ["dinner"]) {
  return {
    weekStart: week,
    familiarOnly: false,
    entries: Array.from({ length: 7 }, (_, day) =>
      slots.map((slot, index) => ({
        ...structuredClone(entries[0]),
        entryId: id(950 + day * 3 + index),
        date: new Date(Date.parse(week) + day * 86400000).toISOString().slice(0, 10),
        slot,
      })),
    ).flat(),
  };
}
export const outcome = (body = content(), patch = {}) => ({
  workerId: id(850),
  expectedRevision: "1",
  content: body,
  failure: null,
  ...patch,
});
export function fixture(t) {
  const f = reservation(t);
  for (const file of [...recipeSelectionFiles.slice(mealRemovalFiles.length), ...workerFiles])
    f.db.file(file);
  const claimCommand = (proposal, worker = id(850), actor = id(1)) =>
    `set role service_role; select public.nest_claim_meal_proposal('${actor}','${id(10)}','${proposal}','${worker}')`;
  const finishCommand = (proposal, value = outcome(), actor = id(1)) =>
    `set role service_role; select public.nest_finish_meal_proposal('${actor}','${id(10)}','${proposal}',${json(value)})`;
  const decode = (text) =>
    Schema.decodeUnknownSync(MealProposalEnvelope)(JSON.parse(text), { onExcessProperty: "error" });
  return {
    ...f,
    claimCommand,
    finishCommand,
    claim: (...args) => JSON.parse(f.db.sql(claimCommand(...args))),
    finish: (...args) => decode(f.db.sql(finishCommand(...args))),
    recover: (proposal, actor = id(1)) =>
      decode(
        f.db.sql(as(`select public.nest_recover_meal_proposal('${id(10)}','${proposal}')`, actor)),
      ),
  };
}
