import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, input, id, options } from "./ai-proposal-tools-fixture.mjs";
test("SDK proposal generation waits for the journal, recovers a lost acknowledgment and never approves", async (t) => {
  const f = await fixture(t);
  const failed = await f
    .connect({ lossy: true })
    .generateMealProposal.execute(input(), options("generate"));
  assert.deepEqual(failed, { ok: false, code: "unavailable" });
  assert.equal(f.provider.calls.length, 0);
  assert.equal(f.remote.db.sql("select count(*) from private.nest_meal_proposals"), "1");
  const tools = f.connect({ lossy: true });
  const saved = await tools.generateMealProposal.execute(input(), options("generate"));
  assert.equal(saved.ok, true);
  assert.equal(saved.value.revision, "1");
  assert.equal(f.provider.calls.length, 2);
  const current = await tools.readMealProposal.execute(
    { proposalId: saved.value.proposalId },
    options("read"),
  );
  assert.equal(current.ok, true);
  assert.equal(current.value.envelope.proposal.status, "ready");
  assert.deepEqual(await tools.generateMealProposal.execute(input(), options("generate")), saved);
  assert.equal(f.provider.calls.length, 2);
  assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "0");
  assert.equal(tools.approveMealProposal, undefined);
});
test("SDK proposal edit completes only the target and exposes immutable reservation plus current recovery", async (t) => {
  const f = await fixture(t),
    tools = f.connect();
  const saved = await tools.generateMealProposal.execute(input(), options("generate"));
  assert.equal(saved.ok, true);
  const proposalId = saved.value.proposalId;
  const before = (await tools.readMealProposal.execute({ proposalId }, options("before"))).value
    .envelope.proposal;
  const command = {
    proposalId,
    expectedRevision: before.revision,
    entryId: before.entries[0].entryId,
  };
  const edit = await tools.replaceProposalMeal.execute(command, options("replace"));
  assert.equal(edit.ok, true);
  assert.equal(edit.value.status, "pending");
  const recovered = await tools.readMealProposalEdit.execute(
    { operationId: edit.value.command.operationId },
    options("recover"),
  );
  assert.equal(recovered.value.status, "applied");
  const after = (await tools.readMealProposal.execute({ proposalId }, options("after"))).value
    .envelope.proposal;
  assert.deepEqual(after.entries.slice(1), before.entries.slice(1));
  assert.notDeepEqual(after.entries[0], before.entries[0]);
  const count = f.provider.calls.length;
  assert.deepEqual(await tools.replaceProposalMeal.execute(command, options("replace")), edit);
  assert.equal(f.provider.calls.length, count);
  const discarded = await tools.discardMealProposal.execute(
    { proposalId, expectedRevision: after.revision },
    options("discard"),
  );
  assert.equal(discarded.ok, true);
  assert.equal(
    (await tools.readMealProposal.execute({ proposalId }, options("discarded"))).value.envelope
      .proposal.status,
    "discarded",
  );
});
test("missing planning credentials cannot journal a new proposal and partner cannot read its private content", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    await f
      .connect({ missingCredentials: true })
      .generateMealProposal.execute(input(), options("generate")),
    { ok: false, code: "unavailable" },
  );
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "0");
  const saved = await f.connect().generateMealProposal.execute(input(), options("generate"));
  assert.equal(saved.ok, true);
  const partner = f.connect({ bearer: f.remote.partnerBearer });
  assert.equal(
    (
      await partner.readMealProposal.execute(
        { proposalId: saved.value.proposalId },
        options("read"),
      )
    ).ok,
    false,
  );
  f.remote.db.sql(
    `delete from public.inbox_notifications; delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.equal(
    (await f.connect().generateMealProposal.execute(input(), options("generate"))).ok,
    false,
  );
  assert.equal(f.provider.calls.length, 2);
});

test("SDK saved choice checks the exact favorite once and retains its original journal reservation", async (t) => {
  const f = await fixture(t),
    tools = f.connect();
  const saved = await tools.generateMealProposal.execute(input(), options("generate"));
  const proposalId = saved.value.proposalId;
  const current = (await tools.readMealProposal.execute({ proposalId }, options("read"))).value
    .envelope.proposal;
  const expectedLibraryRevision = f.remote.db.sql(
    `select revision from public.nest_meal_library_revisions where household_id='${id(10)}'`,
  );
  const command = {
    proposalId,
    expectedRevision: current.revision,
    entryId: current.entries[0].entryId,
    definitionId: id(200),
    expectedLibraryRevision,
  };
  const count = f.provider.calls.length;
  const selected = await tools.chooseProposalRecipe.execute(command, options("choose"));
  assert.equal(selected.ok, true);
  assert.equal(f.provider.calls.length, count + 1);
  const edited = (await tools.readMealProposal.execute({ proposalId }, options("updated"))).value
    .envelope.proposal;
  assert.equal(edited.entries[0].source.kind, "saved");
  assert.equal(edited.entries[0].source.recipe.definitionId, id(200));
  assert.deepEqual(edited.entries.slice(1), current.entries.slice(1));
  assert.deepEqual(await tools.chooseProposalRecipe.execute(command, options("choose")), selected);
  assert.equal(f.provider.calls.length, count + 1);
});

test("lost worker completion acknowledgment keeps a recoverable proposal without a second model run", async (t) => {
  const f = await fixture(t, "/rest/v1/rpc/nest_finish_meal_proposal");
  const result = await f
    .connect({ lossy: true })
    .generateMealProposal.execute(input(), options("generate"));
  assert.deepEqual(result, { ok: false, code: "unavailable" });
  assert.equal(f.proxy.dropped(), 1);
  const calls = f.provider.calls.length;
  const retry = await f
    .connect({ lossy: true })
    .generateMealProposal.execute(input(), options("generate"));
  assert.equal(retry.ok, true);
  assert.equal(f.provider.calls.length, calls);
  const current = await f
    .connect()
    .readMealProposal.execute({ proposalId: retry.value.proposalId }, options("read"));
  assert.equal(current.value.envelope.proposal.status, "ready");
});

test("invalid authority and failed journal insertion never reach the model", async (t) => {
  const f = await fixture(t);
  for (const patch of [{ operationId: id(999) }, { approved: true }, { actorId: id(2) }]) {
    const result = await f.connect().generateMealProposal.execute(input(patch), options("invalid"));
    assert.equal(result.ok, false);
  }
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "0");
  f.remote.db.sql(
    `create function private.reject_tools_journal() returns trigger language plpgsql as $$ begin raise exception 'Injected failure'; end $$; create trigger reject_tools_journal before insert on public.nest_ai_commands for each row execute function private.reject_tools_journal()`,
  );
  assert.equal(
    (await f.connect().generateMealProposal.execute(input(), options("generate"))).ok,
    false,
  );
  assert.equal(f.provider.calls.length, 0);
  assert.equal(f.remote.db.sql("select count(*) from private.nest_meal_proposals"), "0");
});
