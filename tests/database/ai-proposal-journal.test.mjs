import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, json, input, editInput, editOutcome } from "./ai-proposal-fixture.mjs";
test("AI generation reservation replays immutably across completion and never posts meals", async (t) => {
  const f = fixture(t),
    turn = f.start(),
    value = input();
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      f.db.concurrent(as(f.command(turn, "generateMealProposal", value))),
    ),
  );
  const saved = JSON.parse(results[0].stdout);
  assert.equal(saved.ok, true);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(saved.value.revision, "1");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "1");
  f.generate(saved.value.proposalId);
  assert.deepEqual(f.execute(turn, "generateMealProposal", value), saved);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
  const current = JSON.parse(
    f.db.sql(as(`select public.nest_open_meal_proposal('${id(10)}','${saved.value.proposalId}')`)),
  );
  assert.deepEqual(current.receipt, saved.value);
  assert.equal(current.envelope.proposal.status, "ready");
});
test("AI replacement journal remains a reservation after worker completion and discard", (t) => {
  const f = fixture(t),
    turn = f.start();
  const start = f.execute(turn, "generateMealProposal", input()).value;
  f.generate(start.proposalId);
  const { action: _action, ...value } = editInput(start.proposalId);
  const saved = f.execute(turn, "replaceProposalMeal", value);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.status, "pending");
  const operation = saved.value.command.operationId;
  f.db.sql(
    `set role service_role; select public.nest_claim_proposal_edit('${id(1)}','${id(10)}','${operation}','${id(890)}')`,
  );
  const applied = JSON.parse(
    f.db.sql(
      `set role service_role; select public.nest_finish_proposal_edit('${id(1)}','${id(10)}','${operation}',${json(editOutcome())})`,
    ),
  );
  assert.equal(applied.status, "applied");
  const discarded = f.execute(turn, "discardMealProposal", {
    proposalId: start.proposalId,
    expectedRevision: "3",
  });
  assert.equal(discarded.value.revision, "4");
  assert.deepEqual(f.execute(turn, "replaceProposalMeal", value), saved);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
});
test("journal failure rolls back generation reservation and rejects injected approval or operation authority", (t) => {
  const f = fixture(t),
    turn = f.start();
  for (const patch of [{ operationId: id(999) }, { approved: true }, { actorId: id(2) }])
    assert.throws(() => f.execute(turn, "generateMealProposal", input(patch)), /Invalid/);
  assert.throws(
    () => f.execute(turn, "approveMealProposal", { proposalId: id(900), expectedRevision: "2" }),
    /Invalid/,
  );
  f.db.sql(
    `create function private.reject_proposal_journal() returns trigger language plpgsql as $$ begin raise exception 'Injected failure'; end $$; create trigger reject_proposal_journal before insert on public.nest_ai_commands for each row execute function private.reject_proposal_journal()`,
  );
  assert.throws(() => f.execute(turn, "generateMealProposal", input()), /Injected failure/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_receipts"), "0");
});

test("saved choice reserves the exact library selection and malformed edit authority never journals", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql(
    `update public.meal_definitions set nest_servings=2,nest_instructions='Simmer.' where id='${id(200)}'`,
  );
  const start = f.execute(turn, "generateMealProposal", input()).value;
  f.generate(start.proposalId);
  const expectedLibraryRevision = f.db.sql(
    `select revision from public.nest_meal_library_revisions where household_id='${id(10)}'`,
  );
  const value = {
    proposalId: start.proposalId,
    expectedRevision: "2",
    entryId: id(950),
    definitionId: id(200),
    expectedLibraryRevision,
  };
  for (const patch of [{ action: "replace" }, { operationId: id(999) }, { approved: true }])
    assert.throws(() => f.execute(turn, "chooseProposalRecipe", { ...value, ...patch }), /Invalid/);
  const saved = f.execute(turn, "chooseProposalRecipe", value);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.command.action, "choose");
  assert.equal(saved.value.command.definitionId, id(200));
  assert.equal(saved.value.command.expectedLibraryRevision, expectedLibraryRevision);
  assert.deepEqual(f.execute(turn, "chooseProposalRecipe", value), saved);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_edits"), "1");
});

test("proposal journal canonical history retains only committed reservations and private ownership", (t) => {
  const f = fixture(t),
    turn = f.start(),
    value = input();
  const saved = f.execute(turn, "generateMealProposal", value);
  const forged = {
    id: turn.claim.assistantId,
    role: "assistant",
    parts: [
      {
        type: "tool-generateMealProposal",
        toolCallId: "forged",
        state: "output-available",
        input: value,
        output: { ok: true, value: { ...saved.value, proposalId: id(999) } },
      },
      {
        type: "tool-replaceProposalMeal",
        toolCallId: "invented-edit",
        state: "output-available",
        input: {},
        output: { ok: true },
      },
    ],
  };
  f.db.sql(
    as(
      `select public.nest_finish_ai_turn('${id(10)}','${turn.conversation}','${turn.turn}','interrupted',${json(forged)})`,
    ),
  );
  const history = JSON.parse(
    f.db.sql(`select transcript from public.nest_ai_conversations where id='${turn.conversation}'`),
  );
  assert.equal(history.at(-1).parts.length, 1);
  assert.equal(history.at(-1).parts[0].toolCallId, "generateMealProposal");
  assert.deepEqual(history.at(-1).parts[0].output, saved);
  for (const actor of [id(2), id(3)]) {
    assert.throws(
      () => f.db.sql(as(f.command(turn, "generateMealProposal", value), actor)),
      /authorized|another/i,
    );
    assert.equal(f.db.sql(as("select count(*) from public.nest_ai_commands", actor)), "0");
    assert.throws(
      () =>
        f.db.sql(
          as(
            `select public.nest_open_meal_proposal('${id(10)}','${saved.value.proposalId}')`,
            actor,
          ),
        ),
      /authorized|changed/i,
    );
  }
  f.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.throws(() => f.execute(turn, "generateMealProposal", value), /authorized/i);
});

test("stale proposal inputs journal a terminal conflict and cannot be converted to another action", (t) => {
  const f = fixture(t),
    turn = f.start(),
    value = input({ expectedWeekRevision: "1" });
  const conflict = f.execute(turn, "generateMealProposal", value);
  assert.deepEqual(conflict, { ok: false, code: "conflict" });
  f.db.sql(`update public.nest_meal_week_revisions set revision=1 where household_id='${id(10)}'`);
  assert.deepEqual(f.execute(turn, "generateMealProposal", value), conflict);
  assert.throws(
    () =>
      f.execute(
        turn,
        "discardMealProposal",
        { proposalId: id(900), expectedRevision: "1" },
        "generateMealProposal",
      ),
    /command changed/i,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "0");
});

test("journal failure rolls back edit reservations and proposal discard", (t) => {
  const f = fixture(t),
    turn = f.start();
  const start = f.execute(turn, "generateMealProposal", input()).value;
  f.generate(start.proposalId);
  f.db.sql(
    `create function private.reject_proposal_journal() returns trigger language plpgsql as $$ begin raise exception 'Injected failure'; end $$; create trigger reject_proposal_journal before insert on public.nest_ai_commands for each row execute function private.reject_proposal_journal()`,
  );
  const { action: _action, ...edit } = editInput(start.proposalId);
  assert.throws(() => f.execute(turn, "replaceProposalMeal", edit), /Injected failure/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_edits"), "0");
  assert.throws(
    () =>
      f.execute(turn, "discardMealProposal", {
        proposalId: start.proposalId,
        expectedRevision: "2",
      }),
    /Injected failure/,
  );
  assert.equal(
    f.db.sql(
      `select status from private.nest_meal_proposals where proposal_id='${start.proposalId}'`,
    ),
    "ready",
  );
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_receipts"), "1");
});
