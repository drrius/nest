import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, json } from "./ai-refund-fixture.mjs";
import { refund as payload } from "../integration/refund-api-fixture.mjs";
import { settlement } from "../integration/settlement-api-fixture.mjs";
test("AI proposal journal commits one pending private approval and cannot approve or execute it", async (t) => {
  const f = fixture(t),
    turn = f.start(),
    input = payload(f.source);
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
  for (const tool of ["saveRefund", "executeRefund", "decideRefund", "approveAction"])
    assert.throws(() => f.execute(turn, input, tool, tool), /Invalid AI command/);
  assert.throws(() => f.execute(turn, { ...input, note: "Changed" }), /command changed/);
  assert.throws(() => f.execute(turn, { ...input, approved: true }, "injection"), /Invalid refund/);
  assert.throws(() => f.db.sql(as(f.command(turn, input), id(2))), /Not authorized/);
  const confirmed = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_refund('${id(10)}','${approval.operationId}',${json(approval.refund)},'${approval.id}',true)`,
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
    input = payload(f.source);
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
        type: "tool-proposeRefund",
        toolCallId: "refund",
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

test("invalid refund proposals and stale per-person ceilings cannot create approval or money", (t) => {
  const f = fixture(t),
    turn = f.start(),
    input = payload(f.source);
  for (const patch of [
    { sourceEventId: "bad" },
    { approved: true },
    { amountCentimes: "0" },
    { payerId: id(3) },
    {
      allocations: [
        { memberId: id(1), centimes: "401" },
        { memberId: id(2), centimes: "0" },
      ],
      amountCentimes: "401",
    },
    {
      expectedRemaining: [
        { memberId: id(1), centimes: "400" },
        { memberId: id(1), centimes: "600" },
      ],
    },
  ])
    assert.throws(() => f.execute(turn, { ...input, ...patch }, "invalid"));
  const stale = {
    ...input,
    expectedRemaining: [
      { memberId: id(1), centimes: "300" },
      { memberId: id(2), centimes: "600" },
    ],
  };
  assert.deepEqual(f.execute(turn, stale, "stale"), { ok: false, code: "conflict" });
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});

test("refund proposal extension preserves expense and settlement proposals without posting", (t) => {
  const f = fixture(t),
    turn = f.start();
  const expense = {
    description: "Expense",
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
  const values = [
    f.execute(turn, expense, "expense", "proposeExpense"),
    f.execute(
      turn,
      settlement({ amountCentimes: "600", expectedOutstandingCentimes: "600" }),
      "settlement",
      "proposeSettlement",
    ),
    f.execute(turn, payload(f.source), "refund"),
  ];
  for (const value of values) assert.equal(value.value.approval.status, "pending");
  assert.equal(new Set(values.map((value) => value.value.approval.id)).size, 3);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
