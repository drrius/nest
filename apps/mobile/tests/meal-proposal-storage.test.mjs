import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  command,
  receipt,
  id,
  run,
  weekStart,
  account,
} from "./meal-proposal-fixture.mjs";

test("proposal request identity survives SQLite restart and rejects a competing week attempt", async (t) => {
  const f = await fixture(t),
    { store, session } = f;
  const pending = await run(store.stageMealProposal(session, command));
  assert.deepEqual(await run(store.stageMealProposal(session, command)), pending);
  await assert.rejects(
    run(store.stageMealProposal(session, { ...command, operationId: id(801) })),
    { reason: "pending_edit" },
  );
  await run(store.recordMealProposal(session, receipt));
  const reopened = f.reopen();
  const recovered = await run(reopened.store.readMealProposalAttempt(session, weekStart));
  assert.equal(recovered.proposalId, receipt.proposalId);
  assert.deepEqual(recovered.generation, command);
  const row = reopened.connection.prepare("select data from meal_proposal_attempts").get();
  assert.equal(row.data.includes("ingredients"), false);
  assert.equal(reopened.connection.prepare("select count(*) n from offline_operations").get().n, 0);
});

test("proposal metadata enforces account leases and exact reservation/discard bindings", async (t) => {
  const f = await fixture(t),
    { store, session } = f;
  await run(store.stageMealProposal(session, command));
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(801) },
    { expectedWeekRevision: "1" },
  ])
    await assert.rejects(run(store.recordMealProposal(session, { ...receipt, ...patch })), {
      reason: "invalid_receipt",
    });
  await run(store.recordMealProposal(session, receipt));
  const target = {
    weekStart,
    command: { operationId: id(802), proposalId: receipt.proposalId, expectedRevision: "2" },
  };
  const staged = await run(store.stageProposalDiscard(session, target));
  assert.deepEqual(await run(store.stageProposalDiscard(session, target)), staged);
  await assert.rejects(
    run(
      store.stageProposalDiscard(session, {
        ...target,
        command: { ...target.command, expectedRevision: "3" },
      }),
    ),
    { reason: "pending_edit" },
  );
  await assert.rejects(
    run(store.clearMealProposalAttempt(session, { weekStart, operationId: id(801) })),
    { reason: "operation_reused" },
  );
  const other = await run(store.activate({ ...account, actor: id(2) }, id(810)));
  await assert.rejects(run(store.readMealProposalAttempt(session, weekStart)), {
    reason: "session_changed",
  });
  assert.equal(await run(store.readMealProposalAttempt(other, weekStart)), null);
  const own = await run(store.activate(account, id(811)));
  assert.deepEqual(await run(store.readMealProposalAttempt(own, weekStart)), staged);
});
