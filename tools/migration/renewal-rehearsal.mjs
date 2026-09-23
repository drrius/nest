import { verifyLinkedRenewal } from "./renewal-linked.mjs";
import { verifyHistoricalConversion } from "./renewal-history.mjs";
import { verifyRenewalRollback } from "./renewal-rollback.mjs";
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
      ('${id(1106)}','${id(10)}','${id(1)}','Synthetic infinite date','active','infinity',730,null),
      ('${id(1107)}','${id(10)}','${id(1)}',' Synthetic title ','active','2027-03-01',0,null),
      ('${id(1108)}','${id(10)}','${id(1)}',chr(160)||'Synthetic title'||chr(160),'active','2027-03-01',0,null);`);
}
export function captureRenewalHistory(db) {
  return db.sql("select jsonb_agg(to_jsonb(c) order by id) from public.household_commitments c");
}
export async function verifyRenewalPlan(db, before) {
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
      "title-review",
      "title-review",
    ],
  );
  assert.equal(db.sql("select count(*) from public.nest_renewals"), "0");
  verifyRefusedConversions(db, plan);
  await verifyConversion(db, plan[0]);
  verifyLinkedRenewal(db);
  assert.equal(captureRenewalHistory(db), before, "Conversion modified legacy commitment");
  return {
    inventoryVerified: true,
    unlinkedConversionVerified: true,
    linkedConversionImplemented: true,
    provenanceVerified: true,
    provenanceFailureRollbackVerified: true,
    concurrentConversionVerified: true,
    retainedCommitments: 9,
    ready: 1,
    retainedHistory: 1,
    linkReview: 1,
    undated: 1,
    dateReview: 3,
    titleReview: 2,
  };
}

async function verifyConversion(db, source) {
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
  verifyRenewalRollback(db, run, input);
  const command = `set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${renewalConversionSql(input)}`;
  const parallel = await Promise.all([db.concurrent(command), db.concurrent(command)]);
  assert.equal(parallel[0].stdout.trim(), parallel[1].stdout.trim());
  assert.equal(db.sql("select count(*) from private.nest_renewal_conversions"), "1");
  const provenance = JSON.parse(
    db.sql("select row_to_json(c) from private.nest_renewal_conversions c"),
  );
  verifyHistoricalConversion(db, input, id(1), provenance.result);
  assert.equal(provenance.source_hash, input.sourceHash);
  assert.equal(provenance.actor_id, id(1));
  assert.equal(provenance.operation_id, input.operationId);
  assert.equal(provenance.result.renewal.renewalId, input.commitmentId);
  assert.throws(
    () => db.sql("set role authenticated; select * from private.nest_renewal_conversions"),
    /permission denied/,
  );
  assert.throws(
    () => db.sql("delete from private.nest_renewal_conversions"),
    /immutable|append.only/i,
  );
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

function verifyRefusedConversions(db, plan) {
  for (const source of plan.slice(1)) {
    const command = renewalConversionSql({
      householdId: id(10),
      commitmentId: source.id,
      operationId: id(1192),
      sourceHash: source.source_hash,
    });
    assert.throws(
      () => db.sql(`set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${command}`),
      /Commitment requires separate migration review|Invalid renewal|Unsupported renewal deadline/,
    );
  }
  const command = renewalConversionSql({
    householdId: id(10),
    commitmentId: id(1100),
    operationId: id(1193),
    sourceHash: plan[0].source_hash,
  });
  assert.throws(
    () => db.sql(`set role authenticated; set request.jwt.claim.sub='${id(999)}'; ${command}`),
    /Reviewed commitment changed|Not authorized/,
  );
  assert.equal(db.sql("select count(*) from public.nest_renewals"), "0");
}
