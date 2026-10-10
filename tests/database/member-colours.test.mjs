import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/conversation-fixture.sql");
db.file("supabase/migrations/20261010131500_native_member_colours.sql");
beforeEach(() =>
  db.sql("delete from public.nest_member_colour_receipts; delete from public.nest_member_colours"),
);
const colours = ["lake", "clay", "plum", "rose", "marigold", "teal", "indigo", "slate"];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
const sql = (change = {}) => {
  const input = { home: 10, operation: 100, expected: 0, colour: "'plum'", ...change };
  return `select public.nest_save_member_colour('${id(input.home)}','${id(input.operation)}',${input.expected},${input.colour})`;
};
const save = (actor = 1, change) => JSON.parse(db.sql(as(actor, sql(change))));
const read = (actor) =>
  db.sql(
    as(
      actor,
      "select string_agg(actor_id||':'||colour,',' order by actor_id) from public.nest_member_colours",
    ),
  );
const member = (actor) => `household_id='${id(10)}' and user_id='${id(actor)}'`;
const rejoin = (actor) =>
  db.sql(
    `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(actor)}','Fixture') on conflict do nothing`,
  );

test("a member's save and exact retry commit once and both partners read it", () => {
  assert.equal(read(1), "");
  const receipt = save();
  assert.deepEqual(receipt, {
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    revision: "1",
    colour: "plum",
  });
  assert.deepEqual(save(), receipt);
  assert.equal(read(1), `${id(1)}:plum`);
  assert.equal(read(2), `${id(1)}:plum`);
  assert.equal(db.sql("select count(*) from public.nest_member_colour_receipts"), "1");
});

test("other households and anonymous callers cannot read or write colours; receipts stay private", () => {
  save();
  assert.equal(read(3), "");
  assert.equal(db.sql(as(2, "select count(*) from public.nest_member_colour_receipts")), "0");
  assert.equal(db.sql(as(3, "select count(*) from public.nest_member_colour_receipts")), "0");
  assert.throws(
    () => db.sql("set role anon; select * from public.nest_member_colours"),
    /permission denied/,
  );
  assert.throws(() => db.sql(`set role anon; ${sql()}`), /permission denied/);
  assert.throws(() => save(3), /Not authorized/);
  assert.throws(() => save(1, { home: 20 }), /Not authorized/);
});

test("a colour your partner holds is refused and leaves both colours unchanged", () => {
  save(2, { colour: "'teal'" });
  assert.throws(() => save(1, { colour: "'teal'" }), /Member colour taken/);
  assert.equal(read(1), `${id(2)}:teal`);
  save(1, { operation: 101, colour: "'clay'" });
  save(2, { operation: 102, expected: 1, colour: "'rose'" });
  assert.equal(save(1, { operation: 103, expected: 1, colour: "'teal'" }).revision, "2");
  assert.equal(read(2), `${id(1)}:teal,${id(2)}:rose`);
});

test("changed invocations and stale revisions fail while the old receipt replays unchanged", () => {
  const first = save();
  assert.throws(() => save(1, { colour: "'rose'" }), /operation changed/);
  assert.throws(() => save(1, { operation: 101 }), /Member colour changed/);
  assert.equal(save(1, { operation: 101, expected: 1, colour: "'slate'" }).revision, "2");
  assert.deepEqual(save(), first);
  assert.equal(read(1), `${id(1)}:slate`);
});

test("only the eight known colours are accepted", () => {
  for (const colour of colours)
    save(1, {
      operation: 200 + colours.indexOf(colour),
      expected: colours.indexOf(colour),
      colour: `'${colour}'`,
    });
  assert.equal(read(1), `${id(1)}:slate`);
  for (const change of [
    { colour: "null" },
    { colour: "'green'" },
    { colour: "'Lake'" },
    { colour: "' lake'" },
    { colour: "''" },
    { expected: -1 },
    { expected: "null" },
  ])
    assert.throws(() => save(2, change), /Invalid member colour/);
  assert.equal(read(2), `${id(1)}:slate`);
});

test("direct writes, actor reassignment and receipt deletion are denied", () => {
  save();
  for (const statement of [
    "insert into public.nest_member_colours(actor_id,household_id,revision,colour) values(auth.uid(),'" +
      id(10) +
      "',1,'lake')",
    `update public.nest_member_colours set actor_id='${id(2)}'`,
    "update public.nest_member_colours set colour='rose'",
    "delete from public.nest_member_colours",
    "delete from public.nest_member_colour_receipts",
  ])
    assert.throws(() => db.sql(as(1, statement)), /permission denied/);
});

test("a revoked member's colour is hidden, frees the colour and cannot be replayed", (t) => {
  save(2, { colour: "'indigo'" });
  db.sql(`delete from public.household_members where ${member(2)}`);
  t.after(() => rejoin(2));
  assert.equal(read(1), "");
  assert.throws(() => save(2, { colour: "'indigo'" }), /Not authorized/);
  assert.equal(save(1, { colour: "'indigo'" }).colour, "indigo");
  assert.equal(db.sql("select count(*) from public.nest_member_colours"), "2");
});

test("partners racing for the same colour: exactly one wins", async () => {
  const results = await Promise.allSettled(
    [1, 2].map((actor) => db.concurrent(as(actor, sql({ colour: "'marigold'" })))),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.match(read(1), /^[0-9a-f-]+:marigold$/);
});

test("concurrent exact saves commit once and competing first saves conflict", async () => {
  const same = await Promise.all(Array.from({ length: 6 }, () => db.concurrent(as(1, sql()))));
  for (const result of same)
    assert.deepEqual(JSON.parse(result.stdout), JSON.parse(same[0].stdout));
  const competing = await Promise.allSettled(
    [101, 102].map((operation) => db.concurrent(as(2, sql({ operation, colour: "'rose'" })))),
  );
  assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
  assert.equal(db.sql("select count(*) from public.nest_member_colour_receipts"), "2");
});

test("business conflicts use the non-retryable PT412 code", () => {
  save(2, { colour: "'teal'" });
  const code = (change) =>
    db.sql(
      as(
        1,
        `do $$ begin perform ${sql(change).slice(7)}; exception when others then raise exception 'code:%', sqlstate; end $$`,
      ),
    );
  assert.throws(() => code({ colour: "'teal'" }), /code:PT412/);
  save(1, { operation: 101 });
  assert.throws(() => code({ operation: 102 }), /code:PT412/);
});
