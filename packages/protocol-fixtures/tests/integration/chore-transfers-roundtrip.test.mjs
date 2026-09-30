import assert from "node:assert/strict";
import { test } from "node:test";
import { transferFixture, id } from "./chore-transfer-fixture.mjs";
import { run } from "../offline-fixture.mjs";
test("two native SQLite controllers recover a lost request after partner acceptance and preserve alternating succession", async (t) => {
  const { owner, partner, proxy, remote } = await transferFixture(t);
  const current = owner.view().data.chores[0];
  await owner.runtime.requestTransfer(current, id(101));
  assert.equal(proxy.dropped(), 1);
  assert.equal(owner.view().changeStage, "uncertain");
  await owner.runtime.complete(current, id(103), current.dueDate);
  assert.deepEqual((await run(owner.store.readChores(owner.session))).pending, []);
  await partner.runtime.refresh();
  const request = partner.view().data.transfers.transfers[0];
  assert.equal(request.fromMemberId, id(1));
  await partner.runtime.respondTransfer(request, "accept", id(102));
  assert.equal(partner.view().changeStage, "ready");
  assert.equal(partner.view().data.chores[0].assigneeId, id(2));
  await owner.runtime.retryChange();
  assert.equal(owner.view().changeStage, "ready");
  assert.equal(owner.view().data.chores[0].assigneeId, id(2));
  assert.deepEqual(owner.view().data.transfers.transfers, []);
  assert.equal(remote.db.sql("select count(*) from public.nest_chore_transfers"), "1");
  assert.equal(remote.db.sql("select count(*) from public.nest_chore_transfer_receipts"), "2");
  await partner.runtime.complete(partner.view().data.chores[0], id(104), current.dueDate);
  await partner.runtime.refresh();
  assert.notEqual(partner.view().data.chores[0].occurrenceId, current.occurrenceId);
  assert.equal(partner.view().data.chores[0].assigneeId, id(2));
});
test("native lost acceptance retries its original request after partner rebuild without taking the replacement turn", async (t) => {
  const { owner, partner, proxy, remote, routines, created } = await transferFixture(t, 2);
  const original = owner.view().data.chores[0];
  await owner.runtime.requestTransfer(original, id(101));
  await partner.runtime.refresh();
  await partner.runtime.respondTransfer(
    partner.view().data.transfers.transfers[0],
    "accept",
    id(102),
  );
  assert.equal(proxy.dropped(), 1);
  assert.equal(partner.view().changeStage, "uncertain");
  await run(
    routines.edit({
      operationId: id(103),
      routineId: created.routineId,
      expectedVersion: created.version,
      patch: { schedule: { kind: "weekly", weekday: 3 } },
    }),
  );
  await partner.runtime.retryChange();
  assert.equal(partner.view().changeStage, "ready");
  assert.equal(partner.view().pendingWrite, false);
  assert.notEqual(partner.view().data.chores[0].occurrenceId, original.occurrenceId);
  assert.equal(partner.view().data.chores[0].assigneeId, id(1));
  assert.equal(
    remote.db.sql(
      "select count(*) from public.routine_occurrences where nest_accepted_assignee_id is not null",
    ),
    "0",
  );
  assert.equal(remote.db.sql("select count(*) from public.nest_chore_transfer_receipts"), "2");
  assert.deepEqual((await run(partner.store.readChores(partner.session))).pending, []);
});
