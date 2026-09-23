import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { fixture, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { pendingApprovalOperations } from "../../apps/mobile/src/money/pending-approval-operations.ts";
import { PendingApprovalRuntime } from "../../apps/mobile/src/money/pending-approval-runtime.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function setup(t) {
  const f = await expenseApiFixture(t, [
    "supabase/migrations/20260923080025_native_pending_financial_approvals.sql",
  ]);
  f.db
    .sql(`insert into public.nest_action_approvals(id,actor_id,household_id,invocation_id,command,command_version,payload)
    values ('${id(500)}','${id(1)}','${id(10)}','${id(600)}','expenses.record',1,'{}')`);
  const local = await fixture(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(800)));
  let bearer = f.bearer;
  const client = moneyClient(
    f.url,
    session,
    Effect.sync(() => ({ user: { id: id(1) }, access_token: bearer })),
  );
  const operations = pendingApprovalOperations({ store: local.store, session }, client);
  return {
    f,
    local,
    operations,
    setBearer: (token) => {
      bearer = token;
    },
  };
}
test("private approvals clear across background/offline and reject a replaced SQLite account", async (t) => {
  const { local, operations } = await setup(t);
  const runtime = new PendingApprovalRuntime(operations);
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  assert.equal(runtime.getSnapshot().entry, null);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().entry.approvals[0].approvalId, id(500));
  await runtime.setActive(false);
  assert.equal(runtime.getSnapshot().entry, null);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().entry.approvals.length, 1);
  await runtime.setOnline(false);
  assert.equal(runtime.getSnapshot().entry, null);
  await runtime.setOnline(true);
  await run(local.store.activate({ actor: id(2), household: id(10) }, id(801)));
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().entry, null);
  assert.equal(runtime.getSnapshot().verify, true);
});
test("late real approval reads cannot republish after background or disposal", async (t) => {
  const { operations } = await setup(t);
  for (const dispose of [false, true]) {
    const reached = Promise.withResolvers(),
      release = Promise.withResolvers();
    const runtime = new PendingApprovalRuntime({
      read: (after) =>
        operations.read(after).pipe(
          Effect.flatMap((page) =>
            Effect.promise(async () => {
              reached.resolve();
              await release.promise;
              return page;
            }),
          ),
        ),
    });
    await runtime.setOnline(true);
    const loading = runtime.setActive(true);
    await reached.promise;
    if (dispose) runtime.dispose();
    else await runtime.setActive(false);
    release.resolve();
    await loading;
    assert.equal(runtime.getSnapshot().entry, null);
    assert.equal(runtime.getSnapshot().busy, false);
    runtime.dispose();
  }
});

test("same-owner credential recovery can refresh without changing focus, network or SQLite lease", async (t) => {
  const { f, operations, setBearer } = await setup(t);
  const runtime = new PendingApprovalRuntime(operations);
  t.after(() => runtime.dispose());
  setBearer("invalid-fixture-token");
  await runtime.setOnline(true);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().entry, null);
  setBearer(f.bearer);
  await runtime.select(null);
  assert.equal(runtime.getSnapshot().verify, false);
  assert.equal(runtime.getSnapshot().entry.approvals[0].approvalId, id(500));
});
