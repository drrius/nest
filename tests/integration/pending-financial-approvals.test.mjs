import { moneyTools } from "../../apps/api/src/money/tools.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("HTTP pending approvals preserve private pagination through real PostgREST", async (t) => {
  const f = await expenseApiFixture(t, [
    "supabase/migrations/20260923080025_native_pending_financial_approvals.sql",
  ]);
  f.db
    .sql(`insert into public.nest_action_approvals(id,actor_id,household_id,invocation_id,command,command_version,payload)
    select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(1)}','${id(10)}',
      ('00000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,'expenses.record',1,'{"private":"secret"}' from generate_series(500,520)n;`);
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  const first = await fetch(`${f.url}/v1/money/pending-approvals`, { headers });
  assert.equal(first.status, 200);
  const page = await first.json();
  const tools = moneyTools(new Request("http://localhost", { headers }), {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  });
  const ai = await tools.listPendingFinancialApprovals.execute(
    { after: null },
    {
      toolCallId: "pending-approval-list",
      messages: [],
    },
  );
  assert.deepEqual(ai, { ok: true, value: page });
  assert.equal(
    f.db.sql("select count(*) from public.nest_action_approvals where status<>'pending'"),
    "0",
  );
  assert.equal(page.approvals.length, 20);
  assert.equal(page.next, id(519));
  assert.equal(JSON.stringify(page).includes("secret"), false);
  const next = await fetch(`${f.url}/v1/money/pending-approvals?after=${page.next}`, { headers });
  assert.deepEqual(
    (await next.json()).approvals.map((x) => x.approvalId),
    [id(520)],
  );
  const forged = await fetch(`${f.url}/v1/money/pending-approvals?actorId=${id(2)}`, { headers });
  assert.equal(forged.status, 400);
  assert.equal((await fetch(`${f.url}/v1/money/pending-approvals`)).status, 401);
});
