import assert from "node:assert/strict";
import {
  contextBoundaryId as id,
  contextOpening,
  contextPost,
  contextAssign,
  contextRead,
} from "./legacy-context-boundary-calls.mjs";
import { run, denied } from "./legacy-context-boundary-runner.mjs";
export function openingFlows(db, cases) {
  for (const actor of [9981, 9982]) {
    const value = JSON.parse(
      run(
        db,
        actor,
        `select ${contextOpening()}; select ${contextOpening()};
      select jsonb_build_object('events',(select count(*) from public.financial_events where household_id='${id(9980)}' and type='opening_balance'),
        'ledger',(select jsonb_agg(receivable_delta_cents order by member_id) from public.ledger_entries where financial_event_id in (select id from public.financial_events where household_id='${id(9980)}' and type='opening_balance')),
        'receipts',(select count(*) from public.money_command_receipts where household_id='${id(9980)}'))`,
      )
        .split("\n")
        .at(-1),
    );
    assert.deepEqual(value, { events: 1, ledger: [3, -3], receipts: 1 });
    cases.push({
      function: "establish_opening_balance",
      actor,
      sameRetrySingleEvent: true,
      zeroSum: true,
    });
  }
}

export function postingFlows(db, cases) {
  for (const actor of [1, 2]) {
    for (const [kind, context] of [
      ["project", 1300],
      ["asset", 1303],
      ["commitment", 9987],
    ]) {
      const expression = contextPost({ kind, context });
      const result = JSON.parse(
        run(
          db,
          actor,
          `do $test$ declare a jsonb; b jsonb; n bigint;
        begin select count(*) into n from public.financial_events;
          a:=${expression}; b:=${expression};
          if a<>b or (select count(*) from public.financial_events)<>n+1 then raise exception 'Duplicate contextual event'; end if;
          if (select count(*) from public.ledger_entries where financial_event_id=(a->>'event_id')::uuid)<>2
            or (select sum(receivable_delta_cents) from public.ledger_entries where financial_event_id=(a->>'event_id')::uuid)<>0
            then raise exception 'Invalid contextual ledger'; end if;
          if not exists(select 1 from public.household_financial_links where financial_event_id=(a->>'event_id')::uuid
            and coalesce(project_id,asset_id,commitment_id)='${id(context)}') then raise exception 'Missing context'; end if;
        end $test$; select jsonb_build_object('singleEvent',true,'zeroSum',true,'exactContext',true)`,
        ),
      );
      assert.deepEqual(result, { singleEvent: true, zeroSum: true, exactContext: true });
      cases.push({ function: "post_contextual_expense", actor, kind, ...result });
    }
    const setup = `set local request.jwt.claim.sub='${id(actor)}'; select ${contextPost()};`;
    denied(db, cases, {
      name: "post_contextual_expense",
      expression: contextPost({ note: "Changed" }),
      reason: "changed-retry-payload",
      expected: /different expense details or context/,
      actor: actor,
      setup: setup,
    });
    denied(db, cases, {
      name: "post_contextual_expense",
      expression: contextPost(),
      reason: "nonmember-historical-retry",
      expected: /not a member of household/,
      actor: 9981,
      setup: setup,
    });
    postingAfterDetach(db, cases, actor);
  }
}

function postingAfterDetach(db, cases, actor) {
  const result = JSON.parse(
    run(
      db,
      actor,
      `do $test$ declare a jsonb; b jsonb; event uuid; rev uuid;
    begin a:=${contextPost()}; event:=(a->>'event_id')::uuid;
      select revision into rev from public.household_financial_links where financial_event_id=event;
      perform public.assign_expense_context('${id(10)}',event,rev,'${id(9993)}',null,null,null);
      b:=${contextPost()};
      if a<>b or exists(select 1 from public.household_financial_links where financial_event_id=event
        and archived_at is null) then raise exception 'Retry restored detached context'; end if;
    end $test$; select jsonb_build_object('acknowledgmentDoesNotRestoreContext',true)`,
    ),
  );
  assert.equal(result.acknowledgmentDoesNotRestoreContext, true);
  cases.push({ function: "post_contextual_expense", actor, ...result });
}

export function associationFlows(db, cases) {
  const revision = `(select revision from public.household_financial_links where financial_event_id='${id(9990)}')`;
  for (const actor of [1, 2]) {
    const setup = `set local request.jwt.claim.sub='${id(actor)}'; select ${contextAssign()};`;
    denied(db, cases, {
      name: "assign_expense_context",
      expression: contextAssign({ context: 1303, kind: "asset" }),
      reason: "changed-retry-payload",
      expected: /Request already used/,
      actor: actor,
      setup: setup,
    });
    denied(db, cases, {
      name: "assign_expense_context",
      expression: contextAssign({ request: 9992 }),
      reason: "stale-association-revision",
      expected: /association changed/,
      actor: actor,
      setup: setup,
    });
    denied(db, cases, {
      name: "assign_expense_context",
      expression: contextAssign(),
      reason: "nonmember-historical-retry",
      expected: /not a member of household/,
      actor: 9981,
      setup: setup,
    });
    const result = JSON.parse(
      run(
        db,
        actor,
        `do $test$ declare a jsonb; b jsonb;
      begin a:=${contextAssign()}; b:=${contextAssign()}; if a<>b then raise exception 'Changed acknowledgment'; end if;
        perform ${contextAssign({ revision, request: 9992, kind: "asset", context: 1303 })};
        b:=${contextAssign()}; if a<>b then raise exception 'Changed later acknowledgment'; end if;
        if not exists(select 1 from public.household_financial_links where financial_event_id='${id(9990)}'
          and asset_id='${id(1303)}' and project_id is null) then raise exception 'Retry restored original context'; end if;
      end $test$; reset role; select jsonb_build_object('events',(select count(*) from public.financial_events),
        'receipts',(select count(*) from private.expense_context_change_receipts),
        'retainedNewAssociation',true)`,
      )
        .split("\n")
        .at(-1),
    );
    assert.equal(result.events, 9);
    assert.equal(result.receipts, 2);
    assert.equal(result.retainedNewAssociation, true);
    cases.push({ function: "assign_expense_context", actor, noFinancialPosting: true, ...result });
  }
}

export function readFlows(db, cases) {
  for (const actor of [1, 2]) {
    const result = JSON.parse(run(db, actor, `select ${contextRead()}`));
    assert.equal(result.paid_cents, "60");
    assert.equal(result.event_count, "4");
    assert.deepEqual(result.events.map((e) => e.id).sort(), [100, 101, 102, 103].map(id));
    assert.equal(result.events.filter((e) => e.inherited).length, 3);
    const booking = JSON.parse(run(db, actor, `select ${contextRead({ booking: 1304 })}`));
    assert.deepEqual(booking, result);
    const page = JSON.parse(
      run(
        db,
        actor,
        `do $test$ declare p jsonb; cursor_on date; cursor_id uuid; ids uuid[]:='{}';
      begin for i in 1..5 loop p:=public.read_household_cost_context('project','${id(1301)}',1,cursor_on,cursor_id,null);
        if p->>'paid_cents'<>'60' or p->>'event_count'<>'4' then raise exception 'Page lost full total'; end if;
        ids:=ids||array(select (e->>'id')::uuid from jsonb_array_elements(p->'events') e);
        exit when p->'next_cursor'='null'::jsonb;
        cursor_on:=(p->'next_cursor'->>'occurred_on')::date; cursor_id:=(p->'next_cursor'->>'id')::uuid;
      end loop; if cardinality(ids)<>4 or (select count(distinct x) from unnest(ids) x)<>4
        then raise exception 'History pagination lost or duplicated events'; end if;
      end $test$; select jsonb_build_object('completeLineagePagination',true)`,
      ),
    );
    assert.equal(page.completeLineagePagination, true);
    cases.push({
      function: "read_household_cost_context",
      actor,
      exactPaidCentimes: 60,
      exactLineageEvents: 4,
      bookingFilter: true,
      ...page,
    });
  }
}
