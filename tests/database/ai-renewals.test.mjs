import { matchesRenewalReceipt } from "../../apps/api/src/renewals/matches-receipt.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, as, id, json } from "./ai-renewal-fixture.mjs";
test("AI renewal journal creates once, edits exact revision and retains replay after removal", async (t) => {
  const f = fixture(t),
    turn = f.start();
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(turn, f.input)))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(results[0].ok, true);
  const member = { userId: id(1), householdId: id(10) };
  assert.equal(matchesRenewalReceipt("createRenewal", f.input, results[0].value, member), true);
  assert.equal(
    matchesRenewalReceipt(
      "createRenewal",
      { fields: { ...f.input.fields, title: "Forged" } },
      results[0].value,
      member,
    ),
    false,
  );
  assert.equal(
    matchesRenewalReceipt("createRenewal", f.input, results[0].value, { ...member, userId: id(2) }),
    false,
  );
  const original = results[0].value.renewal;
  const edit = f.execute(
    turn,
    {
      renewalId: original.renewalId,
      expectedRevision: original.revision,
      fields: { ...f.input.fields, title: "Updated" },
    },
    "edit",
    "editRenewal",
  );
  assert.equal(edit.ok, true);
  const removed = f.execute(
    turn,
    { renewalId: original.renewalId, expectedRevision: edit.value.renewal.revision },
    "remove",
    "removeRenewal",
  );
  assert.equal(removed.value.renewal.removed, true);
  assert.deepEqual(f.execute(turn, f.input), results[0]);
  assert.equal(f.db.sql("select count(*) from public.nest_renewals"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("journal failure rolls back renewal and rejects injected operation identity", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql(
    "alter table public.nest_ai_commands add constraint fixture_failure check(false) not valid",
  );
  assert.throws(() => f.execute(turn, f.input), /fixture_failure/);
  assert.equal(f.db.sql("select count(*) from public.nest_renewals"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_operations"), "0");
  f.db.sql("alter table public.nest_ai_commands drop constraint fixture_failure");
  assert.throws(
    () => f.execute(turn, { ...f.input, operationId: turn.turn }),
    /Invalid renewal input/,
  );
});

test("renewal AI refuses another owner's turn, foreign assignments and stale revisions", (t) => {
  const f = fixture(t),
    turn = f.start();
  assert.throws(() => f.db.sql(as(f.command(turn, f.input), id(2))), /Not authorized/);
  const rejected = f.execute(
    turn,
    { fields: { ...f.input.fields, responsibleId: id(3) } },
    "foreign",
  );
  assert.equal(rejected.ok, false);
  assert.equal(f.db.sql("select count(*) from public.nest_renewals"), "0");
  const created = f.execute(f.start(), f.input);
  const renewal = created.value.renewal;
  const changed = f.execute(
    f.start(),
    {
      renewalId: renewal.renewalId,
      expectedRevision: renewal.revision,
      fields: { ...f.input.fields, title: "Changed" },
    },
    "edit",
    "editRenewal",
  );
  assert.equal(changed.ok, true);
  const stale = f.execute(
    f.start(),
    { renewalId: renewal.renewalId, expectedRevision: renewal.revision },
    "remove",
    "removeRenewal",
  );
  assert.equal(stale.ok, false);
  assert.equal(f.db.sql("select removed from public.nest_renewals"), "f");
});

test("saved transcript replaces fabricated renewal tool output with its journal receipt", (t) => {
  const f = fixture(t),
    turn = f.start(),
    result = f.execute(turn, f.input);
  const response = {
    id: f.db.sql(`select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`),
    role: "assistant",
    parts: [
      {
        type: "tool-createRenewal",
        toolCallId: "renewal",
        state: "output-available",
        input: f.input,
        output: { ok: true, value: { cancelledContract: true } },
      },
    ],
  };
  f.db.sql(
    as(
      `select public.nest_finish_ai_turn('${id(10)}','${turn.conversation}','${turn.turn}','interrupted',${json(response)})`,
    ),
  );
  const transcript = JSON.parse(
    f.db.sql(
      as(`select transcript from public.nest_ai_conversations where id='${turn.conversation}'`),
    ),
  );
  assert.deepEqual(transcript.at(-1).parts[0].output, result);
  assert.equal(transcript.at(-1).parts.length, 1);
});
