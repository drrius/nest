import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { deriveBalances } from "../../packages/domain/src/money/balances.ts";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-ledger-fixture.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
function event(n, type = "expense", related = null, delta = 101) {
  return `insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents,related_event_id)
    values('${id(n)}','${id(10)}','${type}','2026-09-21','${id(1)}',${type === "reversal" ? "null" : `'${id(delta < 0 ? 2 : 1)}'`},'Synthetic ledger',${Math.abs(delta)},${related ? `'${id(related)}'` : "null"});`;
}
const entries = (
  n,
  cents,
) => `insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values
('${id(10)}','${id(n)}','${id(1)}',${cents}),('${id(10)}','${id(n)}','${id(2)}',${-cents});`;

test("audited ledger enforces immutable history, tenant reads and denied direct member writes", () => {
  db.sql(event(100, "opening_balance") + entries(100, 101));
  db.sql(event(101) + entries(101, 50));
  db.sql(
    `insert into public.financial_allocations(household_id,financial_event_id,member_id,allocated_cents) values('${id(10)}','${id(101)}','${id(1)}',51),('${id(10)}','${id(101)}','${id(2)}',50)`,
  );
  for (const table of ["financial_events", "financial_allocations", "ledger_entries"]) {
    assert.throws(() => db.sql(`delete from public.${table}`), /append-only/);
    const field = table === "financial_events" ? "description=description" : "id=id";
    assert.throws(() => db.sql(`update public.${table} set ${field}`), /append-only/);
    assert.equal(db.sql(as(3, `select count(*) from public.${table}`)), "0");
    assert.throws(
      () => db.sql(`set role anon; select * from public.${table}`),
      /permission denied/,
    );
    assert.throws(() => db.sql(as(1, `delete from public.${table}`)), /permission denied/);
  }
  assert.equal(db.sql(as(2, "select sum(receivable_delta_cents) from public.ledger_entries")), "0");
  assert.throws(() => db.sql(as(1, event(102))), /permission denied/);
  assert.throws(() => db.sql(event(103, "opening_balance")), /duplicate key/);
});
test("reversals preserve their original and reject a second reversal; unbalanced inserts roll back", () => {
  db.sql(event(110) + entries(110, 50));
  db.sql(event(111, "reversal", 110) + entries(111, -50));
  assert.throws(() => db.sql(event(112, "reversal", 110)), /duplicate key/);
  assert.equal(
    db.sql(`select count(*) from public.financial_events where id in ('${id(110)}','${id(111)}')`),
    "2",
  );
  assert.throws(
    () =>
      db.sql(
        `begin; ${event(113)} insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values('${id(10)}','${id(113)}','${id(1)}',1); commit;`,
      ),
    /must sum to zero/,
  );
  assert.equal(db.sql(`select count(*) from public.financial_events where id='${id(113)}'`), "0");
});
test("500 synthetic zero-sum events retain exact database/domain balances including safe-integer endpoints", () => {
  let total = 0n;
  const commands = [];
  for (let n = 0; n < 500; n++) {
    const delta =
      n === 0
        ? Number.MAX_SAFE_INTEGER
        : n === 1
          ? -Number.MAX_SAFE_INTEGER
          : ((n * 7919) % 100001) - 50000;
    total += BigInt(delta);
    commands.push(
      event(1000 + n, "expense", null, delta),
      entries(1000 + n, delta),
      `insert into public.financial_allocations(household_id,financial_event_id,member_id,allocated_cents) values
      ('${id(10)}','${id(1000 + n)}','${id(1)}',${delta < 0 ? -delta : 0}),
      ('${id(10)}','${id(1000 + n)}','${id(2)}',${delta > 0 ? delta : 0});`,
    );
  }
  for (let offset = 0; offset < commands.length; offset += 90)
    db.sql(commands.slice(offset, offset + 90).join("\n"));
  const rows = JSON.parse(
    db.sql(
      `select json_agg(json_build_object('eventId',financial_event_id,'memberId',member_id,'deltaCentimes',receivable_delta_cents) order by financial_event_id,member_id) from public.ledger_entries where financial_event_id >= '${id(1000)}'`,
    ),
  );
  const actual = deriveBalances(rows, [id(1), id(2)]);
  assert.equal(actual[0].centimes, Number(total));
  assert.equal(
    db.sql(
      `select sum(receivable_delta_cents) from public.ledger_entries where financial_event_id >= '${id(1000)}' and member_id='${id(1)}'`,
    ),
    String(total),
  );
});
test("audit records that the legacy zero-sum trigger alone cannot prove a complete event pair", () => {
  db.sql(
    event(2000) +
      `insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values('${id(10)}','${id(2000)}','${id(1)}',0)`,
  );
  assert.throws(
    () =>
      deriveBalances([{ eventId: id(2000), memberId: id(1), deltaCentimes: 0 }], [id(1), id(2)]),
    /Every event must balance/,
  );
});
