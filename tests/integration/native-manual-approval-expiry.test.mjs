import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./recurring-manual-fixture.mjs";
const files = [
  "supabase/migrations/20260921235439_native_recurring_manual_approval.sql",
  "supabase/migrations/20260928092000_native_financial_approval_expiry.sql",
  "supabase/migrations/20261001130000_native_manual_cycle_approval_expiry.sql",
];
const command = "recurring.link-cycle";
test("manual approval expiry distinguishes unused, denied and consumed decisions and isolates their owner", async (t) => {
  const f = await fixture(t, files);
  const propose = (operation) =>
    f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: operation,
      p_command: command,
      p_version: 1,
      p_payload: f.command.input,
    });
  const expiry = (approval, operation, token = f.bearer, name = command) =>
    fetch(
      `${f.url}/v1/money/approval-expiry?approvalId=${approval}&operationId=${operation}&command=${name}`,
      {
        headers: { authorization: `Bearer ${token}`, "x-nest-household": id(10) },
      },
    );
  const unused = await propose(id(700));
  assert.equal((await (await expiry(unused, id(700))).json()).expiredUnused, false);
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${unused}'`,
  );
  assert.equal((await (await expiry(unused, id(700))).json()).expiredUnused, true);
  assert.equal((await expiry(unused, id(700), f.partnerBearer)).status, 403);
  assert.equal((await expiry(unused, id(999))).status, 400);
  assert.equal((await expiry(unused, id(700), f.bearer, "recurring.resume")).status, 400);
  for (const [operation, approved] of [
    [id(701), false],
    [id(702), true],
  ]) {
    const approval = await propose(operation);
    const result = await run(
      f.client().decideManualCycle({
        operationId: operation,
        approvalId: approval,
        input: f.command.input,
        approved,
      }),
    );
    assert.equal(result.status, approved ? "consumed" : "denied");
    f.db.sql(
      `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${approval}'`,
    );
    assert.equal((await (await expiry(approval, operation)).json()).expiredUnused, false);
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
});

test("manual expiry waits for a real in-flight decision and preserves its recorded expense", async (t) => {
  const f = await fixture(t, files);
  const operation = id(801);
  const approval = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operation,
    p_command: command,
    p_version: 1,
    p_payload: f.command.input,
  });
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${approval}'`,
  );
  const writer = f.db.concurrent(`begin;
    set application_name='nest-manual-expiry-race';
    update public.nest_action_approvals set expires_at=now()+interval '1 minute' where id='${approval}';
    set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
    select public.nest_decide_manual_cycle('${id(10)}','${operation}','${JSON.stringify(f.command.input)}'::jsonb,'${approval}',true);
    select pg_sleep(0.5); commit;`);
  try {
    let observed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      observed =
        f.db.sql(
          "select exists(select 1 from pg_stat_activity where application_name='nest-manual-expiry-race' and wait_event='PgSleep')",
        ) === "t";
      if (observed) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(observed, true, "writer must hold its successful uncommitted financial decision");
    const response = await fetch(
      `${f.url}/v1/money/approval-expiry?approvalId=${approval}&operationId=${operation}&command=${command}`,
      {
        headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
      },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).expiredUnused, false);
  } finally {
    await writer;
  }
  const result = await run(f.client().manualCycleApproval(approval));
  assert.equal(result.status, "consumed");
  assert.equal(result.receipt.approvalId, approval);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycle_receipts"), "1");
});
