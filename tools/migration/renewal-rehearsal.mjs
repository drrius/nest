import assert from "node:assert/strict";
import { planLegacyRenewals } from "./renewal-plan.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedRenewalRehearsal(db) {
  db.sql(`insert into public.household_commitments(id,household_id,created_by,title,status,renewal_on,notice_days,recurring_expense_rule_id)
    values('${id(1100)}','${id(10)}','${id(1)}','Synthetic renewal','active','2027-03-01',30,null),
      ('${id(1101)}','${id(10)}','${id(1)}','Synthetic ended','ended','2027-03-01',30,null),
      ('${id(1102)}','${id(10)}','${id(1)}','Synthetic linked','active','2027-03-01',30,'${id(900)}'),
      ('${id(1103)}','${id(10)}','${id(1)}','Synthetic undated','active',null,0,null),
      ('${id(1104)}','${id(10)}','${id(1)}','Synthetic date limit','active','0001-01-01',30,null);`);
}
export function captureRenewalHistory(db) {
  return db.sql("select jsonb_agg(to_jsonb(c) order by id) from public.household_commitments c");
}
export function verifyRenewalPlan(db, before) {
  assert.equal(captureRenewalHistory(db), before, "Legacy commitments changed");
  const plan = planLegacyRenewals(db.sql);
  assert.deepEqual(
    plan.map((row) => row.disposition),
    ["ready", "retain-history", "legacy-link-review", "no-renewal-date", "date-review"],
  );
  assert.equal(db.sql("select count(*) from public.nest_renewals"), "0");
  return {
    inventoryVerified: true,
    conversionImplemented: false,
    retainedCommitments: 5,
    ready: 1,
    retainedHistory: 1,
    linkReview: 1,
    undated: 1,
    dateReview: 1,
  };
}
