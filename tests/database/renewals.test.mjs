import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, as } from "./renewal-fixture.mjs";
import {
  RenewalReceipt,
  RenewalList,
  RenewalRecovery,
} from "../../packages/contracts/src/renewals.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url)),
  Schema = require("effect/Schema");
test("concurrent renewal retries preserve one revision; stale edits fail and historical receipts survive removal", async (t) => {
  const f = fixture(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(1, f.save()))),
  );
  const receipts = results.map((row) => JSON.parse(row.stdout));
  for (const row of receipts) assert.deepEqual(row, receipts[0]);
  const first = receipts[0];
  assert.equal(Schema.is(RenewalReceipt)(first), true);
  assert.equal(first.renewal.cancellationOn, "2028-02-29");
  assert.deepEqual(first.command, { operationId: id(901), ...f.input });
  const update = {
    ...f.input,
    expectedRevision: first.renewal.revision,
    fields: { ...f.fields, noticeDays: 0 },
  };
  const second = f.record(f.save(update, 903), 2);
  assert.notEqual(second.renewal.revision, first.renewal.revision);
  assert.throws(() => f.record(f.save(update, 904)), /changed/);
  assert.throws(
    () => f.record(f.save({ ...f.input, fields: { ...f.fields, title: "Other" } })),
    /operation changed/,
  );
  const removed = f.record(f.remove(second.renewal.revision));
  assert.equal(removed.renewal.removed, true);
  assert.deepEqual(removed.command, {
    operationId: id(902),
    renewalId: id(900),
    expectedRevision: second.renewal.revision,
  });
  assert.deepEqual(f.record(f.remove(second.renewal.revision)), removed);
  assert.deepEqual(f.record(f.save()), first);
  assert.throws(
    () => f.record(f.save({ ...update, expectedRevision: removed.renewal.revision }, 905)),
    /changed/,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
});
test("renewal storage rejects foreign links, direct writes and malformed financial authority", (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into public.nest_recurring_rules(household_id,id,revision,configuration,status,authorized_by) select '${id(20)}','${id(999)}',revision,configuration,status,'${id(3)}' from public.nest_recurring_rules where household_id='${id(10)}' and id='${id(300)}'`,
  );
  for (const fields of [
    { ...f.fields, responsibleId: id(3) },
    { ...f.fields, recurringRuleId: id(999) },
    { ...f.fields, amountCentimes: "100" },
    { ...f.fields, renewalOn: "0001-01-01" },
    { ...f.fields, renewalOn: "2027-02-29" },
    { ...f.fields, noticeDays: 1.5 },
    { ...f.fields, title: "\u00a0Hidden whitespace" },
  ])
    assert.throws(() => f.record(f.save({ ...f.input, fields })));
  assert.throws(() => f.record(f.save(), 3));
  const receipt = f.record(f.save());
  assert.equal(f.db.sql(as(3, "select count(*) from public.nest_renewals")), "0");
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_renewals")), "1");
  assert.throws(
    () => f.db.sql(as(1, "update public.nest_renewals set removed=true")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as(1, "select * from private.nest_renewal_operations")),
    /permission denied/,
  );
  for (const role of ["anon", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; ${f.remove(receipt.renewal.revision)}`),
      /permission denied/,
    );
});
test("receipt failure rolls back renewal creation and retry can then succeed", (t) => {
  const f = fixture(t);
  f.db.sql("alter table private.nest_renewal_operations add constraint fail_receipt check(false)");
  assert.throws(() => f.record(f.save()), /fail_receipt/);
  assert.equal(f.db.sql("select count(*) from public.nest_renewals"), "0");
  f.db.sql("alter table private.nest_renewal_operations drop constraint fail_receipt");
  assert.equal(f.record(f.save()).action, "saved");
  assert.throws(() => f.db.sql("update private.nest_renewal_operations set result='{}'"));
});

test("renewal list pages are household-bound and removed rows remain readable only as history", (t) => {
  const f = fixture(t);
  for (let n = 0; n < 51; n++) f.record(f.save({ ...f.input, renewalId: id(1000 + n) }, 1100 + n));
  const query = (after) =>
    `select public.nest_list_renewals('${id(10)}',${after ? `'${after}'` : "null"})`;
  const first = f.record(query(null));
  assert.equal(Schema.is(RenewalList)(first), true);
  assert.equal(first.renewals.length, 50);
  assert.equal(first.next, id(1049));
  const second = f.record(query(first.next));
  assert.equal(second.renewals.length, 1);
  assert.equal(second.next, null);
  assert.throws(() => f.record(query(null), 3));
  const saved = f.record(f.save());
  f.record(f.remove(saved.renewal.revision));
  assert.equal(
    f.record(`select public.nest_read_renewal('${id(10)}','${id(900)}')`).renewal.removed,
    true,
  );
  assert.equal(
    f.record(query(null)).renewals.some((row) => row.renewalId === id(900)),
    false,
  );
});
test("operation cancellation fences late saves while recorded results remain truthfully recoverable", async (t) => {
  const f = fixture(t);
  const recovery = (cancel = false) =>
    `select public.nest_${cancel ? "cancel" : "read"}_renewal_operation('${id(10)}','${id(901)}')`;
  assert.equal(f.record(recovery()).status, "unresolved");
  const results = await Promise.allSettled([
    f.db.concurrent(as(1, f.save())),
    f.db.concurrent(as(1, recovery(true))),
  ]);
  assert.equal(results[1].status, "fulfilled");
  const outcome = f.record(recovery());
  assert.equal(Schema.is(RenewalRecovery)(outcome), true);
  assert.equal(outcome.status, JSON.parse(results[1].value.stdout).status);
  if (outcome.status === "cancelled") {
    assert.throws(() => f.record(f.save()), /abandoned/);
    assert.equal(f.db.sql("select count(*) from public.nest_renewals"), "0");
  } else {
    assert.equal(outcome.status, "recorded");
    assert.deepEqual(outcome.receipt, f.record(f.save()));
  }
  assert.equal(f.record(recovery(), 2).status, "unresolved");
  assert.throws(() => f.record(recovery(), 3));
});

test("competing member edits cannot overwrite the same renewal revision", async (t) => {
  const f = fixture(t),
    saved = f.record(f.save());
  const outcomes = await Promise.allSettled(
    [1, 2].map((actor) =>
      f.db.concurrent(
        as(
          actor,
          f.save(
            {
              ...f.input,
              expectedRevision: saved.renewal.revision,
              fields: { ...f.fields, title: `Member ${actor}` },
            },
            910 + actor,
          ),
        ),
      ),
    ),
  );
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((row) => row.status === "rejected").length, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_operations"), "2");
  f.record(`select public.nest_cancel_renewal_operation('${id(10)}','${id(950)}')`);
  assert.throws(() => f.record(f.save({ ...f.input, renewalId: id(951) }, 950)), /abandoned/);
});
test("SQL titles agree with code-point limits without trimming ordinary terminal letters", (t) => {
  const f = fixture(t);
  for (const [n, title] of ["Rev", "😀".repeat(160)].entries()) {
    const result = f.record(
      f.save({ ...f.input, renewalId: id(960 + n), fields: { ...f.fields, title } }, 970 + n),
    );
    assert.equal(result.renewal.fields.title, title);
    assert.equal(Schema.is(RenewalReceipt)(result), true);
  }
  for (const title of ["😀".repeat(161), "\vInternet"])
    assert.throws(() => f.record(f.save({ ...f.input, fields: { ...f.fields, title } })));
});
