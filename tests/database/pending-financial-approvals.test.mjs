import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/approval-fixture.sql");
db.file("supabase/migrations/20260919213407_native_action_approvals.sql");
db.file("supabase/migrations/20260920054303_native_private_memory.sql");
db.file("supabase/migrations/20260923080025_native_pending_financial_approvals.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** @param {number} [actor] @param {string|null} [after] */
const read = (actor = 1, after = null) =>
  JSON.parse(
    db.sql(`set role authenticated;
  set request.jwt.claim.sub='${id(actor)}'; select public.nest_pending_financial_approvals('${id(10)}',${after ? `'${after}'` : "null"})`),
  );
test("private financial approval pages omit other owners, expired/decided actions, memory and payload", () => {
  db.sql(`insert into public.nest_action_approvals(id,actor_id,household_id,invocation_id,command,command_version,payload)
    select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(1)}','${id(10)}',
      ('00000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,'expenses.record',1,'{"private":"secret"}' from generate_series(100,125) n;
    update public.nest_action_approvals set actor_id='${id(2)}' where id='${id(121)}';
    update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${id(122)}';
    update public.nest_action_approvals set status='denied' where id='${id(123)}';
    update public.nest_action_approvals set command='memory.save' where id='${id(124)}';
    update public.nest_action_approvals set command='groceryExpenses.record' where id='${id(125)}';`);
  const first = read();
  assert.equal(first.approvals.length, 20);
  assert.equal(first.next, id(119));
  assert.deepEqual(
    read(1, first.next).approvals.map((x) => x.approvalId),
    [id(120)],
  );
  assert.equal(read(1, first.next).next, null);
  assert.equal(JSON.stringify(first).includes("secret"), false);
  assert.deepEqual(
    read(2).approvals.map((x) => x.approvalId),
    [id(121)],
  );
  assert.throws(() => read(3), /Not authorized/);
  assert.throws(
    () => db.sql(`set role anon; select public.nest_pending_financial_approvals('${id(10)}',null)`),
    /permission denied/,
  );
});
