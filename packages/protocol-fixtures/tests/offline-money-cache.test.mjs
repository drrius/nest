import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account } from "./offline-fixture.mjs";
import { id, balance, history, detail } from "./money-cache-fixture.mjs";
const targets = [
  { kind: "balance" },
  { kind: "history", before: null },
  { kind: "detail", eventId: id(100) },
];
test("Money saved views survive restart with exact retained values and no financial queue", async (t) => {
  const f = await fixture(t);
  for (const entry of [balance, history, detail])
    await run(f.store.saveMoney(f.session, entry, () => true));
  const restarted = f.reopen();
  await run(restarted.store.initialize);
  for (let n = 0; n < targets.length; n++)
    assert.deepEqual(
      await run(restarted.store.readMoney(f.session, targets[n])),
      [balance, history, detail][n],
    );
  assert.equal(
    restarted.connection.prepare("select count(*) n from offline_operations").get().n,
    0,
  );
});
test("Money cache leases reject late writes and never expose another member's saved data", async (t) => {
  const f = await fixture(t);
  await run(f.store.saveMoney(f.session, balance, () => true));
  const partner = await run(f.store.activate({ ...account, actor: id(2) }, id(500)));
  assert.equal(await run(f.store.readMoney(partner, targets[0])), null);
  await assert.rejects(run(f.store.readMoney(f.session, targets[0])), {
    reason: "session_changed",
  });
  await assert.rejects(run(f.store.saveMoney(f.session, balance, () => true)), {
    reason: "session_changed",
  });
  await run(f.store.saveMoney(partner, balance, () => true));
  await run(f.store.clearMoney(partner));
  const returned = await run(f.store.activate(account, id(501)));
  assert.deepEqual(await run(f.store.readMoney(returned, targets[0])), balance);
});
test("cancelled save rolls back replacement and stale generation cannot commit", async (t) => {
  const f = await fixture(t);
  await run(f.store.saveMoney(f.session, balance, () => true));
  let calls = 0;
  const newer = { ...balance, savedAt: "2026-09-21T13:00:00.000Z" };
  await assert.rejects(run(f.store.saveMoney(f.session, newer, () => ++calls === 1)), {
    reason: "cancelled",
  });
  assert.equal(calls, 2);
  assert.deepEqual(await run(f.store.readMoney(f.session, targets[0])), balance);
  await assert.rejects(run(f.store.saveMoney(f.session, newer, () => false)), {
    reason: "cancelled",
  });
});
test("Money cache rejects malformed, foreign and mis-keyed data instead of showing a false empty state", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    run(
      f.store.saveMoney(
        f.session,
        { ...balance, value: { ...balance.value, householdId: id(20) } },
        () => true,
      ),
    ),
    { reason: "invalid_input" },
  );
  await assert.rejects(
    run(f.store.saveMoney(f.session, { ...detail, receiptPath: "private" }, () => true)),
    { reason: "invalid_input" },
  );
  await assert.rejects(run(f.store.readMoney(f.session, { kind: "history", before: "bad" })), {
    reason: "invalid_input",
  });
  await run(f.store.saveMoney(f.session, detail, () => true));
  f.connection.prepare("update offline_money_reads set target=?").run(id(101));
  await assert.rejects(run(f.store.readMoney(f.session, { kind: "detail", eventId: id(101) })), {
    reason: "invalid_input",
  });
  f.connection.prepare("update offline_money_reads set data='not-json'").run();
  await assert.rejects(run(f.store.readMoney(f.session, { kind: "detail", eventId: id(101) })), {
    reason: "storage",
  });
  await run(f.store.clearMoney(f.session));
  assert.equal(await run(f.store.readMoney(f.session, { kind: "detail", eventId: id(101) })), null);
});
test("bounded Money retention preserves overview and other kinds while pruning only local older pages/details", async (t) => {
  const f = await fixture(t);
  await run(f.store.saveMoney(f.session, balance, () => true));
  await run(f.store.saveMoney(f.session, history, () => true));
  for (let n = 0; n < 55; n++)
    await run(
      f.store.saveMoney(
        f.session,
        {
          ...detail,
          value: { ...detail.value, event: { ...detail.value.event, eventId: id(100 + n) } },
        },
        () => true,
      ),
    );
  for (let n = 0; n < 25; n++)
    await run(
      f.store.saveMoney(
        f.session,
        { ...history, value: { ...history.value, before: id(200 + n) } },
        () => true,
      ),
    );
  const rows = f.connection
    .prepare("select kind,count(*) n from offline_money_reads group by kind order by kind")
    .all();
  assert.deepEqual(
    rows.map((row) => [row.kind, row.n]),
    [
      ["balance", 1],
      ["detail", 50],
      ["history", 20],
    ],
  );
  assert.deepEqual(await run(f.store.readMoney(f.session, targets[1])), history);
  assert.equal(await run(f.store.readMoney(f.session, targets[2])), null);
  assert.equal(await run(f.store.readMoney(f.session, { kind: "history", before: id(200) })), null);
  assert.equal(f.connection.prepare("select count(*) n from offline_operations").get().n, 0);
});
