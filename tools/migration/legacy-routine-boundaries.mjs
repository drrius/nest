import assert from "node:assert/strict";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const routine = id(9760),
  occurrence = id(9761);
const calls = [
  ["pause_routine", `public.pause_routine('${routine}')`],
  ["unpause_routine", `public.unpause_routine('${routine}')`],
  ["archive_routine", `public.archive_routine('${routine}')`],
  ["skip_occurrence", `public.skip_occurrence('${occurrence}','legacy-skip-boundary')`],
];

function fixture(name) {
  return `insert into auth.users(id) values('${id(9771)}'),('${id(9772)}');
    insert into public.households(id,name) values('${id(9770)}','Routine boundary household');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9770)}','${id(9771)}','Foreign member');
    insert into public.routines(id,household_id,title,area_id,assignment_policy,schedule_kind,schedule_rule,paused_at)
      values('${routine}','${id(10)}','Legacy lifecycle boundary','${id(1200)}','shared','calendar',
      '{"kind":"daily"}',${name === "unpause_routine" ? "now()" : "null"});
    insert into public.routine_occurrences(id,household_id,routine_id,due_date,original_due_date,status,role)
      values('${occurrence}','${id(10)}','${routine}','2026-09-24','2026-09-24','open','current'),
      ('${id(9762)}','${id(10)}','${routine}','2026-09-25','2026-09-25','open','preview');
    insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled)
      values('${routine}','${id(10)}','${id(2)}',true);
    do $seed$ begin
      perform private.create_reminder_candidates_for_occurrence('${occurrence}');
      perform private.create_reminder_candidates_for_occurrence('${id(9762)}');
    end $seed$;
    ${name === "unpause_routine" ? `update public.reminder_candidates set status='cancelled' where occurrence_id in ('${occurrence}','${id(9762)}');` : ""}`;
}

function run(db, name, actor, sql) {
  return db.sql(`begin; ${fixture(name)} set local role authenticated;
    set local request.jwt.claim.sub='${id(actor)}'; ${sql}; rollback;`);
}

function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
    'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o),
    'completions',(select jsonb_agg(to_jsonb(c) order by occurrence_id) from public.routine_completions c),
    'receipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key) from public.routine_command_receipts r),
    'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
    'notices',(select jsonb_agg(to_jsonb(n) order by id) from public.inbox_notifications n),
    'reminders',(select jsonb_agg(to_jsonb(r) order by id) from public.reminder_candidates r),
    'finance',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'ledger',(select jsonb_agg(to_jsonb(e) order by id) from public.ledger_entries e))`);
}

export function verifyLegacyRoutineBoundaries(db) {
  const before = snapshot(db),
    cases = [];
  for (const [name, expression] of calls) {
    for (const actor of [9771, 9772]) {
      assert.throws(
        () => run(db, name, actor, `select ${expression}`),
        /not a (household )?member/,
      );
      cases.push({ function: name, actor, denied: true });
    }
    assert.throws(
      () => run(db, name, 1, `set local role anon; select ${expression}`),
      /permission denied/,
    );
    cases.push({ function: name, actor: "anonymous", denied: true });
    for (const actor of [1, 2]) {
      const actual = JSON.parse(run(db, name, actor, replayAndState(expression)));
      assert.equal(actual.paused, name === "pause_routine");
      assert.equal(actual.archived, name === "archive_routine");
      assert.equal(actual.open, name === "archive_routine" ? 1 : 2);
      assert.equal(actual.skipped, name === "skip_occurrence" ? 1 : 0);
      assert.equal(actual.completions, 0);
      assert.equal(
        actual.pendingReminders,
        actor === 2 && ["unpause_routine", "skip_occurrence"].includes(name) ? 2 : 0,
      );
      cases.push({ function: name, actor, replayAndStatePassed: true });
    }
  }
  assert.equal(
    snapshot(db),
    before,
    "Rolled-back lifecycle probes must retain all original history",
  );
  return { passed: true, cases, originalRowsUnchanged: true, disposableOnly: true };
}

function replayAndState(expression) {
  return `do $probe$ declare first jsonb; activity_count bigint; begin
    first := ${expression}; select count(*) into activity_count from public.activity_events;
    if ${expression} <> first then raise exception 'legacy replay changed result'; end if;
    if (select count(*) from public.activity_events) <> activity_count then
      raise exception 'legacy replay duplicated activity'; end if;
    end $probe$;
    select jsonb_build_object(
      'paused',(select paused_at is not null from public.routines where id='${routine}'),
      'archived',(select archived_at is not null from public.routines where id='${routine}'),
      'open',(select count(*) from public.routine_occurrences where routine_id='${routine}' and status='open'),
      'skipped',(select count(*) from public.routine_occurrences where routine_id='${routine}' and status='skipped'),
      'completions',(select count(*) from public.routine_completions where occurrence_id='${occurrence}'),
      'pendingReminders',(select count(*) from public.reminder_candidates c join public.routine_occurrences o on o.id=c.occurrence_id
        where o.routine_id='${routine}' and c.status='pending'))`;
}
