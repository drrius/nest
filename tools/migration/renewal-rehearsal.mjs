import { renewalConversionSql } from "./renewal-conversion.mjs";
import assert from "node:assert/strict";
import { planLegacyRenewals } from "./renewal-plan.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedRenewalRehearsal(db) {
  db.sql(`insert into public.household_commitments(id,household_id,created_by,title,status,renewal_on,notice_days,recurring_expense_rule_id)
    values('${id(1100)}','${id(10)}','${id(1)}','Synthetic renewal','active','2027-03-01',30,null),
      ('${id(1101)}','${id(10)}','${id(1)}','Synthetic ended','ended','2027-03-01',30,null),
      ('${id(1102)}','${id(10)}','${id(1)}','Synthetic linked','active','2027-03-01',30,'${id(900)}'),
      ('${id(1103)}','${id(10)}','${id(1)}','Synthetic undated','active',null,0,null),
      ('${id(1104)}','${id(10)}','${id(1)}','Synthetic date limit','active','0001-01-01',30,null),
      ('${id(1105)}','${id(10)}','${id(1)}','Synthetic ancient date','active','4713-01-01 BC',730,null),
      ('${id(1106)}','${id(10)}','${id(1)}','Synthetic infinite date','active','infinity',730,null);`);
}
export function captureRenewalHistory(db) {
  return db.sql("select jsonb_agg(to_jsonb(c) order by id) from public.household_commitments c");
}
export function verifyRenewalPlan(db, before) {
  assert.equal(captureRenewalHistory(db), before, "Legacy commitments changed");
  const plan = planLegacyRenewals(db.sql);
  assert.deepEqual(
    plan.map((row) => row.disposition),
    [
      "ready",
      "retain-history",
      "legacy-link-review",
      "no-renewal-date",
      "date-review",
      "date-review",
      "date-review",
    ],
  );
  assert.equal(db.sql("select count(*) from public.nest_renewals"), "0");
  verifyConversion(db, plan[0]);
  assert.equal(captureRenewalHistory(db), before, "Conversion modified legacy commitment");
  return {
    inventoryVerified: true,
    unlinkedConversionVerified: true,
    linkedConversionImplemented: false,
    retainedCommitments: 7,
    ready: 1,
    retainedHistory: 1,
    linkReview: 1,
    undated: 1,
    dateReview: 3,
  };
}

function verifyConversion(db, source) {
  const input = {
    householdId: id(10),
    commitmentId: id(1100),
    operationId: id(1190),
    sourceHash: source.source_hash,
  };
  const run = (value) =>
    db.sql(
      `set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${renewalConversionSql(value)}`,
    );
  assert.throws(() => run({ ...input, sourceHash: "0".repeat(64) }), /Reviewed commitment changed/);
  run(input);
  const first = db.sql("select row_to_json(r) from public.nest_renewals r");
  run(input);
  assert.equal(db.sql("select row_to_json(r) from public.nest_renewals r"), first);
  assert.equal(db.sql("select count(*) from public.nest_renewals"), "1");
  assert.throws(
    () =>
      db.sql(
        `set role authenticated; set request.jwt.claim.sub='${id(2)}'; ${renewalConversionSql({ ...input, operationId: id(1191) })}`,
      ),
    /Renewal changed/,
  );
}
