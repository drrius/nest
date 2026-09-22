import assert from "node:assert/strict";
import test from "node:test";
import { fixture as worker, id, run, Effect } from "./recurring-worker-fixture.mjs";
import { recurringCheckpointClient } from "../../apps/api/src/money/recurring-checkpoint-client.ts";
import { runScheduledRecurring } from "../../apps/api/src/money/recurring-scheduled-run.ts";
import { ApiFailure } from "../../apps/api/src/errors.ts";
async function fixture(t) {
  const f = await worker(t, [
    "supabase/migrations/20260922002959_native_recurring_worker_checkpoint.sql",
  ]);
  return { ...f, checkpoint: recurringCheckpointClient(f.rpc) };
}
test("real scheduled runs persist bounded progress and recover lost finish acknowledgment", async (t) => {
  const f = await fixture(t);
  await f.add(800);
  await f.add(801);
  const checkpoint = {
    ...f.checkpoint,
    finish: (input) =>
      f.checkpoint
        .finish(input)
        .pipe(Effect.flatMap(() => Effect.fail(new ApiFailure({ code: "unavailable" })))),
  };
  await assert.rejects(
    run(runScheduledRecurring(checkpoint, f.worker, { runId: id(900), budget: 1 })),
  );
  const next = await run(
    runScheduledRecurring(f.checkpoint, f.worker, { runId: id(901), budget: 2 }),
  );
  assert.equal(next.report.processed, 1);
  assert.equal(next.report.complete, true);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "2");
  const retained = JSON.parse(
    f.db.sql(`select report from private.nest_recurring_runs where id='${id(900)}'`),
  );
  assert.deepEqual(
    (await run(f.checkpoint.finish({ runId: id(900), report: retained }))).report,
    retained,
  );
});
test("stopped worker lease expires without losing due work; substituted checkpoint replies fail closed", async (t) => {
  const f = await fixture(t);
  await f.add(800);
  await run(f.checkpoint.claim({ runId: id(900), budget: 1 }));
  await assert.rejects(
    run(runScheduledRecurring(f.checkpoint, f.worker, { runId: id(901), budget: 1 })),
  );
  f.db.sql(
    "update private.nest_recurring_sweep set expires_at=clock_timestamp()-interval '1 second'",
  );
  const result = await run(
    runScheduledRecurring(f.checkpoint, f.worker, { runId: id(902), budget: 2 }),
  );
  assert.equal(result.report.processed, 1);
  assert.equal(result.report.failed, 0);
  const fake = recurringCheckpointClient((method, input) =>
    f.rpc(method, input).pipe(Effect.map((reply) => ({ ...reply, runId: id(999) }))),
  );
  await assert.rejects(run(fake.claim({ runId: id(903), budget: 2 })));
  await assert.rejects(run(fake.finish({ runId: id(902), report: result.report })));
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
});
