import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, json } from "./ai-correction-fixture.mjs";
import { correction as payload } from "../integration/correction-api-fixture.mjs";
import { replacement } from "./native-correction-fixture.mjs";
import { correct, refund } from "./money-correction-fixture.mjs";
import { refund as refundPayload } from "../integration/refund-api-fixture.mjs";
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
  for (const tool of ["saveCorrection", "executeCorrection", "decideCorrection", "approveAction"])
    assert.throws(() => f.execute(turn, input, tool, tool), /Invalid AI command/);
  assert.throws(
    () => f.execute(turn, { ...input, expectedReversalId: id(777) }),
    /command changed/,
  );
  assert.throws(
    () => f.execute(turn, { ...input, approved: true }, "injection"),
    /Invalid correction/,
  );
  assert.throws(() => f.db.sql(as(f.command(turn, input), id(2))), /Not authorized/);
  const confirmed = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_correction('${id(10)}','${approval.operationId}',${json(approval.correction)},'${approval.id}',true)`,
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
        type: "tool-proposeCorrection",
        toolCallId: "correction",
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

test("correction proposal extension preserves all financial proposal tools without posting", (t) => {
  const f = fixture(t),
    turn = f.start();
  const values = [
    f.execute(turn, replacement().expense, "expense", "proposeExpense"),
    f.execute(
      turn,
      settlement({ amountCentimes: "600", expectedOutstandingCentimes: "600" }),
      "settlement",
      "proposeSettlement",
    ),
    f.execute(turn, refundPayload(f.source), "refund", "proposeRefund"),
    f.execute(turn, payload(f.source), "correction"),
  ];
  for (const value of values) assert.equal(value.value.approval.status, "pending");
  assert.equal(new Set(values.map((value) => value.value.approval.id)).size, 4);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});

test("invalid replacements and active refunds cannot create correction approval", (t) => {
  const f = fixture(t),
    turn = f.start(),
    input = payload(f.source);
  let index = 0;
  for (const patch of [
    { sourceEventId: "bad" },
    { approved: true },
    { replacement: {} },
    { replacement: { ...replacement(), extra: true } },
    { replacement: { kind: "expense", expense: { ...replacement().expense, payerId: id(3) } } },
    {
      replacement: { kind: "expense", expense: { ...replacement().expense, categoryId: id(999) } },
    },
    {
      replacement: {
        kind: "expense",
        expense: { ...replacement().expense, receiptTotalCentimes: "1" },
      },
    },
  ]) {
    let outcome;
    try {
      outcome = f.execute(turn, { ...input, ...patch }, `invalid-${index++}`);
    } catch {
      continue;
    }
    assert.equal(outcome.ok, false, JSON.stringify(patch));
  }
  assert.deepEqual(f.execute(turn, { ...input, expectedReversalId: id(999) }, "stale"), {
    ok: false,
    code: "conflict",
  });
  f.db.sql(as(refund(f.source, "active-return", 100, 200)));
  assert.deepEqual(f.execute(turn, input, "active"), { ok: false, code: "conflict" });
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
});

test("stale sources conflict and replacing a grocery requires an explicit retained receipt total", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql(
    `insert into public.nest_grocery_expenses(event_id,household_id,receipt_total_cents) values ('${f.source}','${id(10)}',1500)`,
  );
  assert.throws(
    () => f.execute(turn, payload(f.source, { replacement: replacement() }), "missing"),
    /receipt total/,
  );
  const proposed = payload(f.source, {
    replacement: {
      kind: "expense",
      expense: { ...replacement().expense, receiptTotalCentimes: "1500" },
    },
  });
  assert.equal(f.execute(turn, proposed, "grocery").value.approval.status, "pending");
  f.db.sql(as(correct(f.source, "reversed")));
  assert.deepEqual(f.execute(turn, payload(f.source), "stale-source"), {
    ok: false,
    code: "conflict",
  });
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
});

test("AI can propose repair of a reversed opening leaf but cannot fork its retained lineage", (t) => {
  const f = fixture(t),
    turn = f.start();
  const source = f.db.sql(
    `select private.post_financial_event('${id(10)}','${id(1)}','opening_balance','${id(1)}','Opening',100,null,'2026-09-01',null,null,null,null,null,null,null)`,
  );
  const reversed = JSON.parse(f.db.sql(as(correct(source, "reverse-opening"))));
  const reversal = f.db.sql(
    `select id from public.financial_events where related_event_id='${source}' and type='reversal'`,
  );
  assert.ok(reversed);
  const input = payload(source, {
    expectedReversalId: reversal,
    replacement: {
      kind: "opening_balance",
      opening: {
        description: "Opening repaired",
        amountCentimes: "200",
        payerId: id(2),
        date: "2026-09-01",
        note: null,
      },
    },
  });
  const proposal = f.execute(turn, input).value.approval;
  assert.deepEqual(proposal.correction, input);
  assert.equal(proposal.status, "pending");
  const before = f.db.sql("select count(*) from public.financial_events");
  const result = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_correction('${id(10)}','${proposal.operationId}',${json(input)},'${proposal.id}',true)`,
      ),
    ),
  );
  assert.equal(result.approval.receipt.reversalEventId, reversal);
  assert.equal(
    Number(f.db.sql("select count(*) from public.financial_events")),
    Number(before) + 1,
  );
  assert.deepEqual(f.execute(turn, input, "fork"), { ok: false, code: "conflict" });
});
