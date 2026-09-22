import { readFileSync } from "node:fs";
import { fixture as recurring, id, as, json } from "./recurring-worker-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = recurring(t);
  // Load the exact shared UUID validator without unrelated AI journal infrastructure.
  const source = readFileSync(
    "supabase/migrations/20260921120810_native_ai_expense_proposal.sql",
    "utf8",
  );
  f.db.sql(source.slice(0, source.indexOf("create function private.nest_canonical_expense")));
  f.db.file("supabase/migrations/20260922202827_native_renewal_storage.sql");
  const fields = {
    title: "Internet",
    renewalOn: "2028-03-01",
    noticeDays: 1,
    responsibleId: id(2),
    recurringRuleId: id(300),
  };
  const input = { renewalId: id(900), expectedRevision: null, fields };
  const save = (value = input, op = 901) =>
    `select public.nest_save_renewal('${id(10)}','${id(op)}',${json(value)})`;
  const remove = (revision, op = 902) =>
    `select public.nest_remove_renewal('${id(10)}','${id(op)}',${json({ renewalId: id(900), expectedRevision: revision })})`;
  return { ...f, fields, input, save, remove };
}
