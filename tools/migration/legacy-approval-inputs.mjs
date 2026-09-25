import { as, id, payload } from "../../tests/database/native-expense-helpers.mjs";
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const shares = [
  { memberId: id(4), allocatedCents: 51 },
  { memberId: id(5), allocatedCents: 50 },
];
const allocations = shares.map(({ memberId, allocatedCents }) => ({
  memberId,
  centimes: String(allocatedCents),
}));

export function legacyApprovalInput(db, { kind, base, today }) {
  db.sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,
    payer_member_id,proposed_allocations,schedule_kind,day_of_month,active,next_occurrence_on)
    values('${id(base)}','${id(11)}','Synthetic legacy recovery',101,'${id(4)}',${json(shares)},
      'monthly',${Number(today.slice(8))},true,'${today}')`);
  if (kind === "legacy_adoption") return adoptionInput(db, base, today);
  db.sql(`insert into public.expense_drafts(id,household_id,source_kind,description,amount_cents,
    payer_member_id,proposed_allocations,occurred_on,status,recurring_expense_rule_id)
    values('${id(base + 1)}','${id(11)}','recurring','Synthetic retained draft',101,'${id(4)}',
      ${json(shares)},'${today}','pending','${id(base)}')`);
  const context = JSON.parse(
    db.sql(as(4, `select public.nest_read_legacy_draft_context('${id(11)}','${id(base + 1)}')`)),
  );
  const input = { ruleId: id(base), draftId: id(base + 1), reviewToken: context.reviewToken };
  return kind === "legacy_confirmation"
    ? { ...input, expense: payload({ payerId: id(4), allocations, date: today }) }
    : input;
}

function adoptionInput(db, base, today) {
  const context = JSON.parse(
    db.sql(as(4, `select public.nest_read_legacy_adoption_context('${id(11)}','${id(base)}')`)),
  );
  return {
    ruleId: id(base),
    reviewToken: context.reviewToken,
    firstDueOn: today,
    configuration: {
      description: "Explicitly adopted synthetic obligation",
      mode: "fixed",
      amountCentimes: "101",
      allocations,
      payerId: id(4),
      categoryId: null,
      note: null,
      startDate: today,
      schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
    },
  };
}
