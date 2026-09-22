import assert from "node:assert/strict";
import test from "node:test";
import { fixture, id, run, Effect } from "./recurring-worker-fixture.mjs";
import { fixedJobId, runRecurringJobs } from "../../apps/api/src/money/recurring-worker-runner.ts";
import { recurringWorkerClient } from "../../apps/api/src/money/recurring-worker-client.ts";
import { ApiFailure } from "../../apps/api/src/errors.ts";
const count = (f, table) =>
  Number(
    f.db.sql(
      `select count(*) from ${table === "nest_recurring_cycles" ? "public" : "private"}.${table}`,
    ),
  );

test("bounded real worker resumes after cursor, exact job replay posts once", async (t) => {
  const f = await fixture(t),
    first = await f.add(800),
    second = await f.add(801);
  const one = await run(runRecurringJobs(f.worker, { budget: 1, after: null }));
  assert.equal(one.outcomes.length, 1);
  assert.equal(one.complete, false);
  assert.equal(one.outcomes[0].failure, null);
  assert.equal(one.after.ruleId, first.ruleId);
  const receipt = await run(
    f.worker.execute({ jobId: await run(fixedJobId(first)), input: first }),
  );
  assert.equal(receipt.receipt.eventId, one.outcomes[0].eventId);
  const two = await run(runRecurringJobs(f.worker, { budget: 3, after: one.after }));
  assert.equal(two.complete, true);
  assert.equal(two.after, null);
  assert.equal(two.outcomes.length, 1);
  assert.equal(two.outcomes[0].input.ruleId, second.ruleId);
  assert.equal(count(f, "nest_recurring_job_receipts"), 2);
  assert.equal(count(f, "nest_recurring_cycles"), 2);
});

test("failed candidate cannot starve later rules; exact job retry recovers a lost committed reply", async (t) => {
  const f = await fixture(t),
    first = await f.add(800);
  await f.add(801);
  let lost = true;
  const worker = {
    ...f.worker,
    execute: (command) =>
      f.worker.execute(command).pipe(
        Effect.flatMap((result) => {
          if (lost) {
            lost = false;
            return Effect.fail(new ApiFailure({ code: "unavailable" }));
          }
          return Effect.succeed(result);
        }),
      ),
  };
  const result = await run(runRecurringJobs(worker, { budget: 4, after: null }));
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.outcomes.map((v) => v.failure),
    ["unavailable", null],
  );
  const replay = await run(f.worker.execute({ jobId: await run(fixedJobId(first)), input: first }));
  assert.equal(replay.input.ruleId, first.ruleId);
  assert.equal(count(f, "nest_recurring_cycles"), 2);
  assert.equal(count(f, "nest_recurring_job_receipts"), 2);
});

test("scan failure retains continuation and malformed or substituted responses fail closed", async (t) => {
  const f = await fixture(t),
    input = await f.add(800);
  const cursor = { householdId: id(10), ruleId: id(799), dueOn: input.dueOn };
  const broken = { ...f.worker, scan: () => Effect.fail(new ApiFailure({ code: "unavailable" })) };
  const result = await run(runRecurringJobs(broken, { budget: 2, after: cursor }));
  assert.deepEqual(result.after, cursor);
  assert.equal(result.complete, false);
  assert.equal(result.scanFailure, "unavailable");
  for (const budget of [0, 26, 1.5])
    await assert.rejects(run(runRecurringJobs(f.worker, { budget, after: null })));
  const replaced = recurringWorkerClient((method, payload) =>
    f
      .rpc(method, payload)
      .pipe(
        Effect.map((value) =>
          method === "scan" ? { ...value, after: cursor } : { ...value, jobId: id(999) },
        ),
      ),
  );
  await assert.rejects(run(replaced.scan({ limit: 1, after: null })));
  await assert.rejects(run(replaced.execute({ jobId: await run(fixedJobId(input)), input })));
  assert.equal(count(f, "nest_recurring_cycles"), 1);
});

test("uncommitted failure advances this sweep and remains eligible for a later sweep", async (t) => {
  const f = await fixture(t),
    first = await f.add(800);
  await f.add(801);
  const worker = {
    ...f.worker,
    execute: (command) =>
      command.input.ruleId === first.ruleId
        ? Effect.fail(new ApiFailure({ code: "conflict" }))
        : f.worker.execute(command),
  };
  const result = await run(runRecurringJobs(worker, { budget: 4, after: null }));
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.outcomes.map((v) => v.failure),
    ["conflict", null],
  );
  assert.equal(count(f, "nest_recurring_cycles"), 1);
  const retried = await run(runRecurringJobs(f.worker, { budget: 4, after: null }));
  assert.equal(retried.complete, true);
  assert.equal(retried.outcomes.length, 1);
  assert.equal(retried.outcomes[0].input.ruleId, first.ruleId);
  assert.equal(retried.outcomes[0].failure, null);
  assert.equal(count(f, "nest_recurring_cycles"), 2);
});
