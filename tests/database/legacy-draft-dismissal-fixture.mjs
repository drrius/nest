import { fixture as legacy, id, as, json } from "./legacy-recurring-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = legacy(t);
  f.db.file("supabase/migrations/20260922012902_native_legacy_recurring_drafts.sql");
  f.db.file("supabase/migrations/20260922014006_native_legacy_draft_dismissal.sql");
  f.rule();
  f.draft(900, "pending", "2026-01-31");
  const contextQuery = (n = 900) =>
    `select public.nest_read_legacy_draft_context('${id(10)}','${id(n)}')`;
  const context = (n = 900, actor = 1) => f.record(contextQuery(n), actor);
  const input = () => {
    const reviewed = context();
    return {
      draftId: reviewed.draft.draftId,
      ruleId: reviewed.draft.ruleId,
      reviewToken: reviewed.reviewToken,
    };
  };
  /** @param {unknown} value @param {number} [n] @param {string|null} [approval] */
  const command = (value, n = 700, approval = null) =>
    approval === null
      ? `select public.nest_save_legacy_dismissal('${id(10)}','${id(n)}',${json(value)})`
      : `select public.nest_execute_legacy_dismissal('${id(10)}','${id(n)}',${json(value)},'${approval}')`;
  const recovery = (n = 700, cancel = false) =>
    `select public.nest_${cancel ? "cancel" : "read"}_legacy_dismissal('${id(10)}','${id(n)}')`;
  return { ...f, contextQuery, context, input, command, recovery };
}
export const history = (f) =>
  f.db.sql(
    `select jsonb_build_object('events',(select jsonb_agg(to_jsonb(e)) from public.financial_events e),'ledger',(select jsonb_agg(to_jsonb(l)) from public.ledger_entries l),'rules',(select jsonb_agg(to_jsonb(r)) from public.recurring_expense_rules r))`,
  );
