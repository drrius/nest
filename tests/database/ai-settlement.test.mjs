import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, json } from "./ai-settlement-fixture.mjs";
import { settlement as payload } from "../integration/settlement-api-fixture.mjs";
test("AI proposal journal commits one pending private approval and cannot approve or execute it", async (t) => {
  const f = fixture(t),
    turn = f.start(),
    input = payload();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => f.db.concurrent(as(f.command(turn, input)))),
  );
  const values = results.map(({ stdout }) => JSON.parse(stdout.trim()));
  for (const value of values) assert.deepEqual(value, values[0]);
  const approval = values[0].value.approval;
  assert.equal(approval.status, "pending");
  assert.equal(approval.receipt, null);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
  for (const tool of ["saveSettlement", "executeSettlement", "decideSettlement", "approveAction"])
    assert.throws(() => f.execute(turn, input, tool, tool), /Invalid AI command/);
  assert.throws(() => f.execute(turn, { ...input, note: "Changed" }), /command changed/);
  assert.throws(
    () => f.execute(turn, { ...input, approved: true }, "injection"),
    /Invalid settlement/,
  );
  assert.throws(() => f.db.sql(as(f.command(turn, input), id(2))), /Not authorized/);
  const confirmed = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_settlement('${id(10)}','${approval.operationId}',${json(approval.settlement)},'${approval.id}',true)`,
      ),
    ),
  );
  assert.equal(confirmed.approval.status, "consumed");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  assert.deepEqual(f.execute(turn, input), values[0]);
});

test("journal failure rolls back a proposal and recovery replaces fabricated approval outcomes", (t) => {
  const f = fixture(t),
    turn = f.start(),
    input = payload();
  f.db.sql(
    "alter table public.nest_ai_commands add constraint fixture_journal_fail check(false) not valid",
  );
  try {
    assert.throws(() => f.execute(turn, input), /fixture_journal_fail/);
    assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  } finally {
    f.db.sql("alter table public.nest_ai_commands drop constraint fixture_journal_fail");
  }
  const result = f.execute(turn, input);
  const response = {
    id: turn.claim.assistantId,
    role: "assistant",
    parts: [
      {
        type: "tool-proposeSettlement",
        toolCallId: "settlement",
        state: "output-available",
        input,
        output: { ok: true, value: { posted: true } },
      },
    ],
  };
  // Use the authoritative assistant identity even if the turn envelope changes.
  response.id = f.db.sql(
    `select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`,
  );
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
  const parts = transcript.at(-1).parts;
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].output, result);
  assert.deepEqual(f.execute(turn, input), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});

test("AI rejects foreign members, invalid payload and stale balances without a proposal or posting", (t) => {
  const f = fixture(t),
    turn = f.start();
  for (const patch of [
    { recipientId: id(3) },
    { payerId: id(2).replaceAll("-", "") },
    { recipientId: "{" + id(1) + "}" },
    { approved: true },
    { amountCentimes: "1001" },
    { amountCentimes: "0" },
  ])
    assert.throws(() => f.execute(turn, payload(patch), "invalid"), /Invalid settlement/);
  assert.deepEqual(
    f.execute(
      turn,
      payload({ expectedOutstandingCentimes: "900", amountCentimes: "900" }),
      "stale",
    ),
    { ok: false, code: "conflict" },
  );
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});

test("extended journal preserves expense proposals alongside settlement proposals", (t) => {
  const f = fixture(t),
    turn = f.start();
  const expense = {
    description: "Another expense",
    amountCentimes: "100",
    payerId: id(1),
    allocations: [
      { memberId: id(1), centimes: "50" },
      { memberId: id(2), centimes: "50" },
    ],
    date: "2026-09-21",
    note: null,
    categoryId: null,
  };
  const first = f.execute(turn, expense, "expense", "proposeExpense");
  const second = f.execute(turn, payload(), "settlement");
  assert.equal(first.value.approval.status, "pending");
  assert.equal(second.value.approval.status, "pending");
  assert.notEqual(first.value.approval.id, second.value.approval.id);
  assert.deepEqual(f.execute(turn, expense, "expense", "proposeExpense"), first);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
