import { fixture as dismissal, id, as, json } from "./legacy-draft-dismissal-fixture.mjs";
import { payload } from "./native-expense-helpers.mjs";
export { id, as, json };
export function fixture(t) {
  const f = dismissal(t);
  f.db.file("supabase/migrations/20260922023409_native_legacy_draft_confirmation.sql");
  const input = () => ({
    ...f.input(),
    expense: payload({
      description: "Reviewed corrected terms",
      amountCentimes: "235",
      payerId: id(2),
      allocations: [
        { memberId: id(1), centimes: "117" },
        { memberId: id(2), centimes: "118" },
      ],
    }),
  });
  /** @param {unknown} value @param {number} [n] @param {string|null} [approval] */
  const command = (value, n = 700, approval = null) =>
    approval === null
      ? `select public.nest_save_legacy_confirmation('${id(10)}','${id(n)}',${json(value)})`
      : `select public.nest_execute_legacy_confirmation('${id(10)}','${id(n)}',${json(value)},'${approval}')`;
  const recovery = (n = 700, cancel = false) =>
    `select public.nest_${cancel ? "cancel" : "read"}_legacy_confirmation('${id(10)}','${id(n)}')`;
  return { ...f, dismiss: f.command, input, command, recovery };
}
export const counts = (f) =>
  f.db.sql(`select jsonb_build_array(
  (select count(*) from public.financial_events),(select count(*) from public.ledger_entries),
  (select count(*) from public.financial_allocations),(select count(*) from public.activity_events),
  (select count(*) from public.inbox_notifications),(select count(*) from public.push_outbox),
  (select count(*) from private.nest_legacy_confirmation_operations))`);
