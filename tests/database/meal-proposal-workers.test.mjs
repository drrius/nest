import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, outcome, content } from "./meal-proposal-worker-fixture.mjs";

test("one worker claim, immutable concurrent completion and historical retry after discard", async (t) => {
  const f = fixture(t),
    p = f.begin(id(800)).proposalId;
  const claims = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.claimCommand(p))),
  );
  assert.equal(claims.filter((r) => JSON.parse(r.stdout).claimed).length, 1);
  assert.equal(f.claim(p).claimed, false);
  const replies = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.finishCommand(p))),
  );
  const ready = f.read(p);
  assert.equal(ready.proposal.status, "ready");
  assert.equal(ready.proposal.revision, "2");
  assert.equal(ready.proposal.entries.length, 7);
  for (const reply of replies) assert.deepEqual(JSON.parse(reply.stdout), ready);
  f.discard(id(801), p, "2");
  assert.deepEqual(f.finish(p), ready);
  assert.equal(f.read(p).proposal.status, "discarded");
  for (const table of ["meal_plan_entries", "grocery_items", "routines"])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  assert.equal(f.db.sql("select count(*) from public.meal_definitions"), "3");
  assert.throws(() => f.finish(p, outcome(null, { failure: "unavailable" })), /result changed/);
});

test("claim/finish are server-only; recovery and replay require current owner membership", (t) => {
  const f = fixture(t),
    p = f.begin(id(800)).proposalId;
  for (const role of ["anon", "authenticated"])
    for (const command of [f.claimCommand(p), f.finishCommand(p)])
      assert.throws(
        () => f.db.sql(command.replace("set role service_role", `set role ${role}`)),
        /permission denied/,
      );
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_meal_proposal_jobs`),
      /permission denied/,
    );
  assert.throws(() => f.claim(p, id(850), id(2)), /Proposal changed/);
  assert.throws(() => f.claim(p, id(850), id(3)), /authorized/);
  assert.throws(() => f.recover(p, id(2)), /Proposal changed/);
  f.claim(p);
  f.finish(p);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.claim(p), /authorized/);
  assert.throws(() => f.finish(p), /authorized/);
  assert.throws(() => f.recover(p), /authorized/);
});

test("deadline recovery fails once without authorizing another model call or overwriting ready content", (t) => {
  const f = fixture(t),
    p = f.begin(id(800)).proposalId;
  f.claim(p);
  assert.equal(f.recover(p).proposal.status, "generating");
  f.db.sql(
    `update private.nest_meal_proposal_jobs set deadline_at=clock_timestamp()-interval '1 second'`,
  );
  const failed = f.recover(p);
  assert.equal(failed.proposal.status, "failed");
  assert.equal(failed.proposal.failure, "unavailable");
  assert.equal(failed.proposal.revision, "2");
  assert.deepEqual(f.recover(p), failed);
  assert.equal(f.claim(p, id(851)).claimed, false);
  assert.throws(() => f.finish(p), /result changed/);
  const ready = f.begin(id(801)).proposalId;
  f.claim(ready);
  f.finish(ready);
  f.db.sql(
    `update private.nest_meal_proposal_jobs set deadline_at=clock_timestamp()-interval '1 second'`,
  );
  assert.equal(f.recover(ready).proposal.status, "ready");
  const unclaimed = f.begin(id(802)).proposalId;
  f.db.sql(
    `update private.nest_meal_proposals set expires_at=clock_timestamp()-interval '1 second' where proposal_id='${unclaimed}'`,
  );
  assert.equal(f.claim(unclaimed).claimed, false);
  assert.equal(f.recover(unclaimed).proposal.status, "failed");
});

test("worker identity, exact revision and strict failures reject without altering pending state", (t) => {
  const f = fixture(t),
    p = f.begin(id(800)).proposalId;
  f.claim(p);
  for (const patch of [
    { workerId: id(851) },
    { expectedRevision: "2" },
    { content: null },
    { failure: "invented" },
    { approved: true },
  ])
    assert.throws(() => f.finish(p, outcome(content(), patch)), /changed|Invalid/);
  assert.equal(f.read(p).proposal.revision, "1");
  const failed = f.finish(p, outcome(null, { failure: "no_suitable_meals" }));
  assert.equal(failed.proposal.failure, "no_suitable_meals");
  assert.deepEqual(f.finish(p, outcome(null, { failure: "no_suitable_meals" })), failed);
});

test("receipt failure rolls back completion; concurrent discard cannot be overwritten", async (t) => {
  const f = fixture(t),
    p = f.begin(id(800)).proposalId;
  f.claim(p);
  f.db
    .sql(`create function private.fail_worker_receipt() returns trigger language plpgsql as $$begin raise exception 'fixture receipt failure'; end$$;
    create trigger fail_worker_receipt before update on private.nest_meal_proposal_jobs for each row execute function private.fail_worker_receipt()`);
  assert.throws(() => f.finish(p), /fixture receipt failure/);
  assert.equal(f.read(p).proposal.status, "generating");
  assert.equal(f.read(p).proposal.revision, "1");
  f.db.sql("drop trigger fail_worker_receipt on private.nest_meal_proposal_jobs");
  assert.equal(f.finish(p).proposal.status, "ready");
  for (let n = 0; n < 10; n++) {
    const proposal = f.begin(id(810 + n)).proposalId;
    f.claim(proposal);
    const results = await Promise.allSettled([
      f.db.concurrent(f.finishCommand(proposal)),
      f.db.concurrent(f.discardCommand(id(900 + n), proposal)),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const current = f.read(proposal).proposal;
    assert.equal(current.revision, "2");
    assert.ok(["ready", "discarded"].includes(current.status));
  }
});
