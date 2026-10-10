import assert from "node:assert/strict";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = id(9860);
const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const allocation = (first = 2, second = 1, member = 2) => [
  { memberId: id(1), allocatedCents: first },
  { memberId: id(member), allocatedCents: second },
];

function fixture() {
  return `insert into auth.users(id) values('${id(9871)}'),('${id(9872)}'),('${id(9873)}');
    insert into public.households(id,name) values('${id(9870)}','Foreign financial boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9870)}','${id(9871)}','Foreign first'),('${id(9870)}','${id(9872)}','Foreign second');
    insert into public.expense_categories(id,household_id,name,sort_order)
      values('${id(9874)}','${id(9870)}','Foreign category',0);
    set local request.jwt.claim.sub='${id(1)}';
    insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,
      payer_member_id,description,amount_cents)
      values('${source}','${id(10)}','expense','2026-10-04','${id(1)}','${id(1)}','Boundary source',3);
    insert into public.financial_allocations(household_id,financial_event_id,member_id,allocated_cents)
      values('${id(10)}','${source}','${id(1)}',2),('${id(10)}','${source}','${id(2)}',1);
    insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents)
      values('${id(10)}','${source}','${id(1)}',1),('${id(10)}','${source}','${id(2)}',-1);`;
}

function expense({
  amount = 3,
  payer = 1,
  members = allocation(),
  category = null,
  note = "Boundary only",
} = {}) {
  return `public.post_manual_expense('${id(10)}','Boundary expense',${amount},'${id(payer)}',
    ${literal(members)},'2026-10-04','legacy-financial-expense',
    ${category === null ? "null" : `'${id(category)}'`},'${note}',null)`;
}

function refund({ amount = 1, members = allocation(1, 0), note = "Boundary only" } = {}) {
  return `public.post_refund('${source}',${amount},${literal(members)},'2026-10-04',
    'legacy-financial-refund','Boundary refund','${note}')`;
}

function correction({ payer = 1, members = allocation(4, 1), note = "Boundary only" } = {}) {
  return `public.correct_financial_event('${source}','legacy-financial-correction',${literal({
    description: "Boundary replacement",
    amount_cents: 5,
    payer_member_id: id(payer),
    allocations: members,
    occurred_on: "2026-10-04",
    note,
  })})`;
}

function settlement({ payer = 2, amount = 1, note = "Boundary only" } = {}) {
  return `public.record_settlement('${id(10)}','${id(payer)}',${amount},'2026-10-04',
    'Boundary settlement','legacy-financial-settlement','${note}','partial')`;
}

function run(db, actor, sql, { role = "authenticated", setup = "" } = {}) {
  return db.sql(`begin; ${fixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}

function retained(db) {
  return db.sql(`select jsonb_build_object(
    'receipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key)
      from public.money_command_receipts r),
    'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
    'notices',(select jsonb_agg(to_jsonb(n) order by id) from public.inbox_notifications n),
    'categories',(select jsonb_agg(to_jsonb(c) order by id) from public.expense_categories c),
    'members',(select jsonb_agg(to_jsonb(m) order by household_id,user_id) from public.household_members m),
    'households',(select jsonb_agg(to_jsonb(h) order by id) from public.households h))`);
}

function denied(db, cases, { name, expression, actor = 1, reason, expected, ...options }) {
  assert.throws(() => run(db, actor, `select ${expression}`, options), expected);
  cases.push({
    function: name,
    actor,
    role: options.role ?? "authenticated",
    reason,
    denied: true,
  });
}

export function verifyLegacyFinancialBoundaries(db) {
  const before = captureRehearsal(db),
    metadata = retained(db),
    cases = [];
  const calls = [
    ["post_manual_expense", expense(), expense({ note: "Changed boundary" }), 1],
    ["post_refund", refund(), refund({ note: "Changed boundary" }), 1],
    ["correct_financial_event", correction(), correction({ note: "Changed boundary" }), 2],
    ["record_settlement", settlement(), settlement({ note: "Changed boundary" }), 1],
  ];
  for (const [name, expression] of calls) {
    for (const actor of [9871, 9873, null])
      denied(db, cases, {
        name,
        expression,
        actor,
        reason: "foreign-or-absent-member",
        expected: /not a member of household/,
      });
    denied(db, cases, {
      name,
      expression,
      actor: 1,
      role: "anon",
      reason: "anonymous-execution",
      expected: /permission denied/,
    });
  }
  invalidTerms(db, cases);
  verifyMemberFlows(db, cases, calls);
  assert.equal(compareRehearsal(before, captureRehearsal(db)).passed, true);
  assert.equal(
    retained(db),
    metadata,
    "Rolled-back financial boundary checks changed original state",
  );
  return {
    passed: true,
    cases,
    compiledPublicFunctions: functionMetadata(db),
    exactOriginalFinancialAndReceiptRowsRetained: true,
    metadataAndNotificationsRetained: true,
    disposableOnly: true,
    legacyReceiptsHouseholdScoped: true,
    nativePrivateReceiptsNotClaimed: true,
  };
}

function verifyMemberFlows(db, cases, calls) {
  for (const actor of [1, 2]) {
    for (const [name, expression, changed, added] of calls) {
      const value = JSON.parse(
        run(
          db,
          actor,
          `do $financial$ declare
        first_result jsonb; second_result jsonb; before_count bigint;
        begin select count(*) into before_count from public.financial_events;
          first_result:=${expression}; second_result:=${expression};
          if first_result is distinct from second_result then raise exception 'Retry changed receipt'; end if;
          if (select count(*) from public.financial_events)<>before_count+${added} then
            raise exception 'Retry duplicated financial history'; end if;
          if exists(select 1 from public.financial_events e where
            (select count(*) from public.ledger_entries l where l.financial_event_id=e.id)<>2
            or (select sum(receivable_delta_cents) from public.ledger_entries l
              where l.financial_event_id=e.id)<>0) then raise exception 'Invalid ledger'; end if;
        end $financial$;
        select jsonb_build_object('sameReceipt',true,'exactAddedEvents',${added},'twoMemberZeroSum',true)`,
        ),
      );
      assert.deepEqual(value, {
        sameReceipt: true,
        exactAddedEvents: added,
        twoMemberZeroSum: true,
      });
      cases.push({ function: name, actor, ...value });
      denied(db, cases, {
        name,
        expression: changed,
        actor,
        setup: `select ${expression};`,
        reason: "changed-idempotent-payload",
        expected: /idempotency key was already used for a different command/,
      });
      denied(db, cases, {
        name,
        expression,
        actor: 9871,
        setup: `set local request.jwt.claim.sub='${id(actor)}'; select ${expression};`,
        reason: "nonmember-historical-retry",
        expected: /not a member of household/,
      });
    }
  }
}

function invalidTerms(db, cases) {
  const variants = [
    [
      "post_manual_expense",
      expense({ payer: 9871 }),
      "foreign-payer",
      /foreign key|household members/,
    ],
    [
      "post_manual_expense",
      expense({ members: allocation(2, 1, 9871) }),
      "foreign-allocation",
      /household members/,
    ],
    ["post_manual_expense", expense({ category: 9874 }), "foreign-category", /foreign key/],
    [
      "post_manual_expense",
      expense({ amount: -1 }),
      "negative-amount",
      /non-negative safe integer/,
    ],
    [
      "post_manual_expense",
      expense({ amount: 9007199254740992 }),
      "unsafe-centime-amount",
      /safe integer/,
    ],
    [
      "post_refund",
      refund({ amount: 3, members: allocation(3, 0) }),
      "excess-member-refund",
      /remaining refundable shares/,
    ],
    [
      "post_refund",
      refund({ amount: 1, members: allocation(1, 0, 9871) }),
      "foreign-allocation",
      /household members/,
    ],
    [
      "correct_financial_event",
      correction({ payer: 9871 }),
      "foreign-replacement-payer",
      /foreign key|household members/,
    ],
    [
      "correct_financial_event",
      correction({ members: allocation(4, 1, 9871) }),
      "foreign-replacement-allocation",
      /household members/,
    ],
    ["record_settlement", settlement({ payer: 9871 }), "foreign-settlement-payer", /named payer/],
    [
      "record_settlement",
      settlement({ amount: 0 }),
      "zero-partial-settlement",
      /within the current balance/,
    ],
  ];
  for (const [name, expression, reason, expected] of variants)
    denied(db, cases, { name, expression, reason, expected });
  denied(db, cases, {
    name: "correct_financial_event",
    expression: correction(),
    setup: `select ${refund()};`,
    reason: "active-refund-blocks-source-correction",
    expected: /Reverse the active refunds/,
  });
}

function functionMetadata(db) {
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'name',p.proname,'signature',p.oid::regprocedure::text,
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('post_manual_expense','post_refund','correct_financial_event','record_settlement')`),
  );
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.securityDefiner, true);
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, true);
  }
  return rows;
}
