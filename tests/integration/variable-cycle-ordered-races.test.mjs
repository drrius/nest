import assert from "node:assert/strict";
import { test } from "node:test";
import { variableCycleRaceFixture } from "./variable-cycle-race-fixture.mjs";
import { run } from "./recurring-variable-fixture.mjs";

for (const first of ["save", "cancel"]) {
  test(`${first} wins an actually blocked variable bill race with one terminal outcome`, async (t) => {
    const f = await variableCycleRaceFixture(t, first);
    const client = f.client(f.raceURL);
    const saving = run(client.saveVariableCycle(f.command)).then(
      (receipt) => ({ receipt }),
      (error) => ({ error }),
    );
    await f.wait(first === "save" ? "saveBlocked" : "saves");
    const cancelling = run(client.cancelVariableCycleSave(f.command));
    await f.wait("cancelBlocked");
    if (first === "cancel") {
      f.releaseSave();
      await f.wait("saveBlocked");
    }
    assert.equal(f.state().saveBlocked, true);
    assert.equal(f.state().cancelBlocked, true);
    await f.release();
    const [saved, cancelled] = await Promise.all([saving, cancelling]);
    const recovery = await run(client.recoverVariableCycle(f.command));
    assert.deepEqual(cancelled, recovery);
    assert.equal(recovery.status, first === "save" ? "recorded" : "cancelled");
    if (first === "save") assert.deepEqual(saved.receipt, recovery.receipt);
    else assert.ok(saved.error);
    for (const table of [
      "financial_events",
      "nest_recurring_cycles",
      "nest_recurring_cycle_receipts",
    ])
      assert.equal(f.db.sql(`select count(*) from public.${table}`), first === "save" ? "1" : "0");
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_cycle_save_cancellations"),
      first === "cancel" ? "1" : "0",
    );
    assert.equal(
      f.db.sql("select coalesce(sum(receivable_delta_cents),0) from public.ledger_entries"),
      "0",
    );
    assert.equal(
      f.db.sql("select count(*) from public.ledger_entries"),
      first === "save" ? "2" : "0",
    );
    assert.deepEqual(await run(client.cancelVariableCycleSave(f.command)), recovery);
  });
}
