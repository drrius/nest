import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  id,
  as,
  input,
  json,
  week,
  entries,
} from "./meal-proposal-reservation-fixture.mjs";

test("private generation reservation has one immutable receipt under concurrent retry and no meal side effects", async (t) => {
  const f = fixture(t),
    before = Date.now();
  const replies = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.command(id(800)))),
  );
  const receipt = JSON.parse(replies[0].stdout);
  for (const reply of replies) assert.deepEqual(JSON.parse(reply.stdout), receipt);
  const current = f.read(receipt.proposalId).proposal;
  assert.equal(current.status, "generating");
  assert.equal(current.entries, null);
  assert.equal(current.revision, "1");
  assert.ok(current.expiresAt >= before + 86400000 && current.expiresAt <= Date.now() + 86400000);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_receipts"), "1");
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
  assert.equal(f.db.sql("select count(*) from public.routines"), "0");
  f.db.sql(
    `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
  );
  const discarded = f.discard(id(801), receipt.proposalId);
  assert.equal(discarded.revision, "2");
  assert.deepEqual(f.begin(id(800)), receipt);
  assert.deepEqual(f.discard(id(801), receipt.proposalId), discarded);
  assert.throws(() => f.begin(id(800), input({ familiarOnly: true })), /operation changed/);
  assert.throws(() => f.discard(id(800), receipt.proposalId), /operation changed/);
});

test("partner, outsider, anonymous and revoked users cannot read private proposals, fingerprints or recover receipts", (t) => {
  const f = fixture(t),
    own = f.begin(id(800));
  const partner = f.begin(id(800), input(), id(2));
  assert.notEqual(partner.proposalId, own.proposalId);
  assert.throws(() => f.read(own.proposalId, id(2)), /Proposal changed/);
  assert.throws(() => f.discard(id(801), own.proposalId, "1", id(2)), /Proposal changed/);
  assert.throws(() => f.read(own.proposalId, id(3)), /authorized/);
  assert.throws(() => f.begin(id(801), input(), id(1), id(20)), /authorized/);
  for (const role of ["authenticated", "anon", "service_role"])
    for (const table of ["nest_meal_proposals", "nest_meal_proposal_receipts"])
      assert.throws(
        () => f.db.sql(`set role ${role}; select * from private.${table}`),
        /permission denied/,
      );
  assert.throws(
    () =>
      f.db.sql(
        `set role anon; select public.nest_read_meal_proposal('${id(10)}','${own.proposalId}')`,
      ),
    /permission denied/,
  );
  assert.equal(JSON.stringify(f.read(own.proposalId)).includes("Hash"), false);
  assert.equal(JSON.stringify(f.read(own.proposalId)).includes("Vegetarian"), false);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.read(own.proposalId), /authorized/);
  assert.throws(() => f.begin(id(800)), /authorized/);
  assert.throws(() => f.discard(id(801), own.proposalId), /authorized/);
});

test("invalid or stale input and missing setup cannot reserve a proposal", (t) => {
  const f = fixture(t);
  for (const value of [
    null,
    [],
    {},
    input({ approved: true }),
    input({ actorId: id(2) }),
    input({ weekStart: "2030-01-08" }),
    input({ weekStart: "2030-02-30" }),
    input({ weekStart: null }),
    input({ expectedWeekRevision: 0 }),
    input({ expectedWeekRevision: "01" }),
    input({ expectedWeekRevision: "9223372036854775808" }),
    input({ familiarOnly: "true" }),
  ])
    assert.throws(() => f.begin(id(800), value), /Invalid/);
  assert.throws(() => f.begin(id(800), input({ expectedWeekRevision: "1" })), /changed/);
  f.db.sql(`delete from public.nest_food_profiles where actor_id='${id(2)}'`);
  assert.throws(() => f.begin(id(800)), /setup incomplete/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_receipts"), "0");
});

test("failed receipt insertion rolls back both reservation and discard, including untouched-week counter", (t) => {
  const f = fixture(t);
  f.db
    .sql(`create function private.fixture_fail_proposal_receipt() returns trigger language plpgsql as $$begin raise exception 'receipt failure'; end$$;
    create trigger fixture_fail_proposal_receipt before insert on private.nest_meal_proposal_receipts for each row execute function private.fixture_fail_proposal_receipt()`);
  assert.throws(() => f.begin(id(800)), /receipt failure/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_meal_week_revisions"), "0");
  f.db.sql(
    "alter table private.nest_meal_proposal_receipts disable trigger fixture_fail_proposal_receipt",
  );
  const receipt = f.begin(id(800));
  f.db.sql(
    "alter table private.nest_meal_proposal_receipts enable trigger fixture_fail_proposal_receipt",
  );
  assert.throws(() => f.discard(id(801), receipt.proposalId), /receipt failure/);
  assert.equal(f.read(receipt.proposalId).proposal.status, "generating");
  assert.equal(f.read(receipt.proposalId).proposal.revision, "1");
});

test("discard is an exact revision transition with concurrent immutable replay, and approved content cannot be discarded", async (t) => {
  const f = fixture(t),
    receipt = f.begin(id(800));
  const replies = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.discardCommand(id(801), receipt.proposalId))),
  );
  for (const reply of replies)
    assert.deepEqual(JSON.parse(reply.stdout), JSON.parse(replies[0].stdout));
  assert.equal(f.read(receipt.proposalId).proposal.status, "discarded");
  assert.throws(() => f.discard(id(802), receipt.proposalId, "2"), /changed/);
  const second = f.begin(id(803));
  f.db.sql(
    `update private.nest_meal_proposals set revision=2,status='approved',entries=${json(entries)} where proposal_id='${second.proposalId}'`,
  );
  assert.throws(() => f.discard(id(804), second.proposalId, "2"), /changed/);
  assert.throws(
    () =>
      f.db.sql(
        as(
          `select public.nest_discard_meal_proposal('${id(10)}','${id(805)}',${json({ proposalId: second.proposalId, expectedRevision: "0" })})`,
        ),
      ),
    /Invalid/,
  );
});

test("a configured full week rejects reservation without overwriting its entries", (t) => {
  const f = fixture(t);
  f.db.sql(`insert into public.meal_plan_entries(household_id,date,slot,title_snapshot)
    select '${id(10)}',date '${week}'+d,'dinner','Existing dinner' from generate_series(0,6) d`);
  assert.throws(
    () => f.begin(id(800), input({ expectedWeekRevision: "7" })),
    /No empty meal slots/,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "0");
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "7");
});

test("expired ready proposals can be discarded without erasing retained content; stale and unsupported-isolation writes fail", (t) => {
  const f = fixture(t),
    receipt = f.begin(id(800));
  f.db
    .sql(`update private.nest_meal_proposals set revision=2,status='ready',entries=${json(entries)},
    expires_at=clock_timestamp()-interval '1 second' where proposal_id='${receipt.proposalId}'`);
  assert.throws(() => f.discard(id(801), receipt.proposalId, "1"), /changed/);
  assert.throws(
    () =>
      f.db.sql(
        `begin isolation level repeatable read; ${f.discardCommand(id(801), receipt.proposalId, "2")}`,
      ),
    /changed/,
  );
  const discarded = f.discard(id(801), receipt.proposalId, "2");
  assert.equal(discarded.revision, "3");
  const current = f.read(receipt.proposalId).proposal;
  assert.equal(current.status, "discarded");
  assert.deepEqual(current.entries, entries);
  assert.throws(
    () => f.db.sql(`begin isolation level repeatable read; ${f.command(id(800))}`),
    /changed/,
  );
  assert.throws(
    () => f.db.sql(as(`update private.nest_meal_proposals set status='ready'`)),
    /permission denied/,
  );
});
