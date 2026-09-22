import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, as, json, history } from "./legacy-draft-dismissal-fixture.mjs";
import { approve } from "./recurring-mandate-fixture.mjs";
import {
  LegacyDraftContext,
  LegacyDismissalReceipt,
  LegacyDismissalRecovery,
} from "../../packages/contracts/src/legacy-draft-dismissal.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url)),
  Schema = require("effect/Schema");
test("dismissal retries retain exact reviewed terms, change only draft status and recover the same immutable receipt", async (t) => {
  const f = fixture(t),
    input = f.input(),
    before = history(f),
    reviewed = f.context();
  assert.equal(Schema.is(LegacyDraftContext)(reviewed), true);
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(1, f.command(input)))),
  );
  const receipt = JSON.parse(rows[0].stdout);
  for (const row of rows) assert.deepEqual(JSON.parse(row.stdout), receipt);
  assert.equal(Schema.is(LegacyDismissalReceipt)(receipt), true);
  assert.deepEqual(receipt.reviewed, reviewed);
  assert.equal(
    f.db.sql(`select status from public.expense_drafts where id='${id(900)}'`),
    "dismissed",
  );
  assert.equal(history(f), before);
  const recovery = f.record(f.recovery());
  assert.equal(Schema.is(LegacyDismissalRecovery)(recovery), true);
  assert.deepEqual(recovery.receipt, receipt);
  assert.deepEqual(f.record(f.recovery(700, true)), recovery);
  assert.throws(() => f.record(f.command({ ...input, ruleId: id(801) })), /decision changed/);
  assert.throws(() => f.db.sql("update private.nest_legacy_draft_operations set result='{}'"));
  assert.throws(() => f.db.sql("delete from private.nest_legacy_draft_operations"));
});
test("review tokens detect raw draft changes even with unchanged timestamps and identical normalized split display", (t) => {
  const f = fixture(t);
  f.db.sql(
    "update public.expense_drafts set proposed_allocations='[]',updated_at='2026-01-01 10:00:00+00'",
  );
  const input = f.input(),
    before = f.context();
  f.db.sql(
    "update public.expense_drafts set proposed_allocations='[null]',updated_at='2026-01-01 10:00:00+00'",
  );
  const after = f.context();
  assert.deepEqual(before.draft, after.draft);
  assert.notEqual(before.reviewToken, after.reviewToken);
  assert.throws(() => f.record(f.command(input)), /draft changed/);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
  f.record(f.command(f.input()));
});
test("pending drafts with financial events and posted or dismissed drafts cannot be dismissed", (t) => {
  const f = fixture(t),
    input = f.input();
  f.post(900);
  assert.throws(() => f.record(f.command(input)), /draft changed/);
  assert.throws(() => f.record(f.command(f.input())), /requires reconciliation/);
  for (const status of ["posted", "dismissed"]) {
    f.draft(
      status === "posted" ? 901 : 902,
      status,
      status === "posted" ? "2026-02-28" : "2026-03-31",
    );
    const c = f.context(status === "posted" ? 901 : 902);
    assert.throws(
      () =>
        f.record(
          f.command({
            draftId: c.draft.draftId,
            ruleId: c.draft.ruleId,
            reviewToken: c.reviewToken,
          }),
        ),
      /requires reconciliation/,
    );
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("different member decisions serialize on the draft and cannot both acquire successful receipts", async (t) => {
  const f = fixture(t),
    input = f.input();
  const results = await Promise.allSettled([
    f.db.concurrent(as(1, f.command(input))),
    f.db.concurrent(as(2, f.command(input))),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_draft_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("explicit AI approval binds payload and rolls back with dismissal on receipt failure", (t) => {
  const f = fixture(t),
    input = f.input(),
    approval = approve(f.db, 700, input, "recurring.dismiss-legacy-draft");
  f.db.sql(
    "alter table private.nest_legacy_draft_operations add constraint fail_dismissal check(false)",
  );
  assert.throws(() => f.record(f.command(input, 700, approval)));
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "approved",
  );
  f.db.sql("alter table private.nest_legacy_draft_operations drop constraint fail_dismissal");
  assert.throws(() => f.record(f.command(input, 701, approval)));
  assert.throws(() => f.record(f.command(input, 700, approval), 2));
  const receipt = f.record(f.command(input, 700, approval));
  assert.equal(receipt.approvalId, approval);
  assert.equal(Schema.is(LegacyDismissalReceipt)(receipt), true);
  assert.deepEqual(f.record(f.command(input, 700, approval)), receipt);
  assert.throws(() => f.record(f.recovery()), /Not a direct Save/);
  assert.throws(
    () =>
      f.record(
        `select public.nest_execute_legacy_dismissal('${id(10)}','${id(702)}',${json(input)},null)`,
      ),
    /approval required/,
  );
});
test("abandonment fences late writes and a save-cancel race has one durable outcome", async (t) => {
  const f = fixture(t),
    input = f.input();
  assert.equal(f.record(f.recovery()).status, "unresolved");
  const abandoned = f.record(f.recovery(701, true));
  assert.equal(abandoned.status, "cancelled");
  assert.equal(Schema.is(LegacyDismissalRecovery)(abandoned), true);
  assert.throws(() => f.record(f.command(input, 701)), /abandoned/);
  await Promise.allSettled([
    f.db.concurrent(as(1, f.command(input))),
    f.db.concurrent(as(1, f.recovery(700, true))),
  ]);
  const result = f.record(f.recovery());
  assert.ok(["recorded", "cancelled"].includes(result.status));
  assert.equal(
    f.db.sql("select status from public.expense_drafts"),
    result.status === "recorded" ? "dismissed" : "pending",
  );
  if (result.status === "recorded") assert.deepEqual(f.record(f.command(input)), result.receipt);
  else assert.throws(() => f.record(f.command(input)), /abandoned/);
});
test("context, dismissal and recovery deny outsider roles and cross-rule payload substitution", (t) => {
  const f = fixture(t),
    input = f.input();
  for (const query of [f.contextQuery(), f.command(input), f.recovery(), f.recovery(700, true)]) {
    assert.throws(() => f.record(query, 3), /Not authorized/);
    for (const role of ["anon", "service_role"])
      assert.throws(() => f.db.sql(`set role ${role}; ${query}`), /permission denied/);
  }
  assert.throws(() => f.record(f.command({ ...input, ruleId: id(801) })), /unavailable/);
  assert.throws(
    () => f.record(f.command({ ...input, unreviewed: true })),
    /Invalid legacy dismissal/,
  );
  assert.throws(
    () => f.db.sql(as(1, "select * from private.nest_legacy_draft_operations")),
    /permission denied/,
  );
  f.record(f.command(input));
  assert.equal(f.record(f.recovery(), 2).status, "unresolved");
});
