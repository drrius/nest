import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, as, json, counts } from "./legacy-draft-confirmation-fixture.mjs";
import { approve } from "./recurring-mandate-fixture.mjs";
import {
  LegacyConfirmationReceipt,
  LegacyConfirmationRecovery,
} from "../../packages/contracts/src/legacy-draft-confirmation.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url)),
  Schema = require("effect/Schema");
test("confirmation retries append one linked financial event with exact explicit terms and retain the original draft", async (t) => {
  const f = fixture(t),
    input = f.input(),
    reviewed = f.context();
  const original = f.db.sql(
    "select to_jsonb(d)-'status'-'updated_at' from public.expense_drafts d",
  );
  const rules = f.db.sql("select to_jsonb(r) from public.recurring_expense_rules r");
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(1, f.command(input)))),
  );
  const receipt = JSON.parse(rows[0].stdout);
  for (const row of rows) assert.deepEqual(JSON.parse(row.stdout), receipt);
  assert.equal(Schema.is(LegacyConfirmationReceipt)(receipt), true);
  assert.deepEqual(receipt.reviewed, reviewed);
  assert.deepEqual(receipt.input, input);
  assert.equal(
    f.db.sql("select to_jsonb(d)-'status'-'updated_at' from public.expense_drafts d"),
    original,
  );
  assert.equal(f.db.sql("select to_jsonb(r) from public.recurring_expense_rules r"), rules);
  assert.equal(f.context().draft.eventId, receipt.eventId);
  assert.equal(f.context().draft.status, "posted");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select amount_cents from public.financial_events"), "235");
  assert.equal(
    f.db.sql(
      "select string_agg(receivable_delta_cents::text,',' order by member_id) from public.ledger_entries",
    ),
    "-117,117",
  );
  assert.equal(
    f.db.sql(
      "select count(*) from public.inbox_notifications where entity_id='" + receipt.eventId + "'",
    ),
    "1",
  );
  const recovery = f.record(f.recovery());
  assert.equal(Schema.is(LegacyConfirmationRecovery)(recovery), true);
  assert.deepEqual(recovery.receipt, receipt);
  assert.deepEqual(f.record(f.recovery(700, true)), recovery);
  assert.throws(
    () => f.record(f.command({ ...input, expense: { ...input.expense, note: "Changed" } })),
    /decision changed/,
  );
  assert.throws(() =>
    f.db.sql("update private.nest_legacy_confirmation_operations set result='{}'"),
  );
  assert.throws(() => f.db.sql("delete from private.nest_legacy_confirmation_operations"));
});
test("raw source changes, linked events and nonpending drafts reject confirmation without duplicate financial history", (t) => {
  const f = fixture(t),
    input = f.input();
  f.db.sql("update public.expense_drafts set proposed_allocations='[]'");
  assert.throws(() => f.record(f.command(input)), /draft changed/);
  f.post(900);
  assert.throws(() => f.record(f.command(f.input())), /requires reconciliation/);
  for (const status of ["posted", "dismissed"]) {
    f.db.sql(`update public.expense_drafts set status='${status}'`);
    assert.throws(() => f.record(f.command(f.input())), /requires reconciliation/);
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"), "0");
});
test("confirmation and another member's dismissal race to exactly one terminal draft outcome", async (t) => {
  const f = fixture(t),
    input = f.input();
  const { expense: _, ...dismiss } = input;
  const results = await Promise.allSettled([
    f.db.concurrent(as(1, f.command(input))),
    f.db.concurrent(as(2, f.dismiss(dismiss))),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const status = f.db.sql("select status from public.expense_drafts");
  assert.ok(["posted", "dismissed"].includes(status));
  assert.equal(
    f.db.sql("select count(*) from public.financial_events"),
    status === "posted" ? "1" : "0",
  );
  assert.equal(
    f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"),
    status === "posted" ? "1" : "0",
  );
});
test("exact approval and financial posting roll back together on receipt or notification failure", (t) => {
  const f = fixture(t),
    input = f.input(),
    approval = approve(f.db, 700, input, "recurring.confirm-legacy-draft"),
    before = counts(f);
  for (const table of ["private.nest_legacy_confirmation_operations", "public.push_outbox"]) {
    f.db.sql(`alter table ${table} add constraint injected_failure check(false) not valid`);
    assert.throws(() => f.record(f.command(input, 700, approval)));
    assert.equal(counts(f), before);
    assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
    assert.equal(
      f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
      "approved",
    );
    f.db.sql(`alter table ${table} drop constraint injected_failure`);
  }
  assert.throws(() => f.record(f.command(input, 701, approval)));
  assert.throws(() => f.record(f.command(input, 700, approval), 2));
  assert.throws(() =>
    f.record(f.command({ ...input, expense: { ...input.expense, note: "Other" } }, 700, approval)),
  );
  const receipt = f.record(f.command(input, 700, approval));
  assert.equal(receipt.approvalId, approval);
  f.db.sql("update public.nest_action_approvals set expires_at=now()-interval '1 second'");
  assert.deepEqual(f.record(f.command(input, 700, approval)), receipt);
  assert.throws(() => f.record(f.recovery()), /Not a direct Save/);
  assert.throws(
    () =>
      f.record(
        `select public.nest_execute_legacy_confirmation('${id(10)}','${id(702)}',${json(input)},null)`,
      ),
    /approval required/,
  );
});
test("abandonment fences late confirmation and race recovery cannot report cancellation after a commit", async (t) => {
  const f = fixture(t),
    input = f.input();
  assert.equal(f.record(f.recovery()).status, "unresolved");
  assert.equal(f.record(f.recovery(701, true)).status, "cancelled");
  assert.throws(() => f.record(f.command(input, 701)), /abandoned/);
  await Promise.allSettled([
    f.db.concurrent(as(1, f.command(input))),
    f.db.concurrent(as(1, f.recovery(700, true))),
  ]);
  const result = f.record(f.recovery());
  assert.equal(Schema.is(LegacyConfirmationRecovery)(result), true);
  assert.ok(["recorded", "cancelled"].includes(result.status));
  assert.equal(
    f.db.sql("select count(*) from public.financial_events"),
    result.status === "recorded" ? "1" : "0",
  );
  if (result.status === "recorded") assert.deepEqual(f.record(f.command(input)), result.receipt);
  else assert.throws(() => f.record(f.command(input)), /abandoned/);
});
test("confirmation validates tenant, membership, private receipts and exact expense fields", (t) => {
  const f = fixture(t),
    input = f.input();
  for (const query of [f.command(input), f.recovery(), f.recovery(700, true)]) {
    assert.throws(() => f.record(query, 3), /Not authorized/);
    for (const role of ["anon", "service_role"])
      assert.throws(() => f.db.sql(`set role ${role}; ${query}`), /permission denied/);
  }
  for (const patch of [
    { payerId: id(3) },
    { receiptPath: `${id(10)}/receipts/${id(80)}.jpg` },
    { receiptTotalCentimes: "300" },
    { amountCentimes: "236" },
    { allocations: [] },
    { amountCentimes: "9007199254740992" },
  ])
    assert.throws(() => f.record(f.command({ ...input, expense: { ...input.expense, ...patch } })));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  const result = f.record(f.command(input));
  assert.equal(
    Schema.is(LegacyConfirmationReceipt)({
      ...result,
      reviewed: { ...result.reviewed, reviewToken: "0".repeat(64) },
    }),
    false,
  );
  assert.equal(f.record(f.recovery(), 2).status, "unresolved");
  assert.throws(
    () => f.db.sql(as(1, "select * from private.nest_legacy_confirmation_operations")),
    /permission denied/,
  );
});

test("zero, odd and maximum-safe centimes retain exact allocations and a complete zero-sum ledger", (t) => {
  const f = fixture(t);
  for (const [index, amount] of [0n, 1n, 9007199254740991n].entries()) {
    const draftId = 900 + index;
    if (index > 0) f.draft(draftId, "pending", index === 1 ? "2026-02-28" : "2026-03-31");
    const reviewed = f.context(draftId),
      expense = {
        ...f.input().expense,
        amountCentimes: String(amount),
        payerId: id(2),
        allocations: [
          { memberId: id(1), centimes: String(amount / 2n) },
          { memberId: id(2), centimes: String(amount - amount / 2n) },
        ],
      };
    const result = f.record(
      f.command(
        { draftId: id(draftId), ruleId: id(800), reviewToken: reviewed.reviewToken, expense },
        710 + index,
      ),
    );
    assert.equal(Schema.is(LegacyConfirmationReceipt)(result), true);
    assert.equal(
      f.db.sql(
        `select count(*)||':'||sum(receivable_delta_cents) from public.ledger_entries where financial_event_id='${result.eventId}'`,
      ),
      "2:0",
    );
    assert.equal(
      f.db.sql(
        `select count(*)||':'||sum(allocated_cents) from public.financial_allocations where financial_event_id='${result.eventId}'`,
      ),
      `2:${amount}`,
    );
    assert.equal(
      f.db.sql(`select amount_cents from public.financial_events where id='${result.eventId}'`),
      String(amount),
    );
  }
});

test("actual retained legacy confirmation and native confirmation cannot post the same draft twice", async (t) => {
  const f = fixture(t),
    input = f.input();
  f.db.file("tests/database/legacy-money/draft-confirmation.sql");
  const legacy = `select public.confirm_expense_draft('${id(900)}','legacy-race')`;
  const results = await Promise.allSettled([
    f.db.concurrent(as(1, f.command(input))),
    f.db.concurrent(as(2, legacy)),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "posted");
  assert.equal(
    f.db.sql(`select count(*) from public.financial_events where expense_draft_id='${id(900)}'`),
    "1",
  );
  assert.equal(
    f.db.sql("select count(*)||':'||sum(receivable_delta_cents) from public.ledger_entries"),
    "2:0",
  );
  if (results[0].status === "fulfilled")
    assert.deepEqual(f.record(f.command(input)), JSON.parse(results[0].value.stdout));
  else assert.deepEqual(f.record(legacy, 2), JSON.parse(results[1].value.stdout));
});
