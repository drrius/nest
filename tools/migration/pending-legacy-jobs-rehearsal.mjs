import assert from "node:assert/strict";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { verifyLegacyPushRetry } from "./legacy-push-retry-rehearsal.mjs";

// Disposable full-schema fixture only. Every producer/consumer probe rolls back.
export function verifyPendingLegacyJobs(db) {
  const before = snapshot(db);
  const financial = captureRehearsal(db);
  const baseline = JSON.parse(db.sql(baselineSql()));
  assert.deepEqual(baseline, {
    reminderDelivered: true,
    recurringDraftGenerated: true,
    unclaimedOutboxSkipped: true,
    liveClaimPreserved: true,
  });
  assert.equal(snapshot(db), before, "Active-job probe did not restore retained work");
  const pushRetry = verifyLegacyPushRetry(db, seedSql());
  assert.equal(snapshot(db), before, "Expired-push probe did not restore retained work");
  const paused = JSON.parse(db.sql(pausedSql()));
  assert.deepEqual(paused, { entryPointsRefused: 3, pendingWorkUnchanged: true });
  assert.equal(snapshot(db), before, "Paused-job probe did not restore retained work");
  assert.equal(compareRehearsal(financial, captureRehearsal(db)).passed, true);
  return {
    baseline,
    paused,
    pushRetry,
    rollbackVerified: true,
    financialHistoryUnchanged: true,
    schedulerVerified: false,
    dispatchedRequestsDrained: false,
    productionTouched: false,
  };
}

function snapshot(db) {
  return db.sql(snapshotSql());
}

function snapshotSql() {
  const tables = [
    "reminder_candidates",
    "inbox_notifications",
    "push_outbox",
    "push_subscriptions",
    "job_claims",
    "recurring_expense_rules",
    "expense_drafts",
    "notification_digest_preferences",
  ];
  const pairs = tables.map(
    (table) =>
      `'${table}',(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.${table} r)`,
  );
  pairs.push(
    "'controls',(select jsonb_agg(to_jsonb(c) order by job_kind) from private.nest_legacy_job_control c)",
  );
  return `select jsonb_build_object(${pairs.join(",")})`;
}

function seedSql() {
  return `insert into public.reminder_candidates(id,household_id,occurrence_id,member_id,remind_on,remind_local_time,status)
    values('00000000-0000-4000-8000-000000004100','00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000001212','00000000-0000-4000-8000-000000000002',
      (now() at time zone 'Europe/Zurich')::date-1,'00:00','pending');
    insert into public.inbox_notifications(id,household_id,recipient_member_id,kind,dedupe_key)
    select id,'00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002',
      'routine_reminder','nest-pending-fixture:'||id from (values
      ('00000000-0000-4000-8000-000000004101'::uuid),
      ('00000000-0000-4000-8000-000000004102'::uuid)) notifications(id);
    insert into public.push_outbox(id,household_id,recipient_member_id,inbox_notification_id,status,
      attempt_count,claim_token,claimed_at,claim_expires_at)
    values('00000000-0000-4000-8000-000000004103','00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000004101','pending',0,null,null,null),
      ('00000000-0000-4000-8000-000000004104','00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000004102','pending',2,
      '00000000-0000-4000-8000-000000004105',now(),now()+interval '1 hour');`;
}

function baselineSql() {
  return `begin; ${seedSql()}
    create temporary table live_claim_before as select to_jsonb(p) body from public.push_outbox p
      where id='00000000-0000-4000-8000-000000004104';
    do $probe$ begin
      perform public.run_deliver_due_reminders('deliver_due_reminders:nest-pending-baseline',100);
      perform public.run_generate_recurring_drafts_cron('generate_recurring_drafts_cron:nest-pending-baseline','2026-03-31',50);
      perform public.run_drain_push_outbox('drain_push_outbox:nest-pending-baseline',50);
    end $probe$;
    select jsonb_build_object(
      'reminderDelivered',(select status='delivered' from public.reminder_candidates where id='00000000-0000-4000-8000-000000004100'),
      'recurringDraftGenerated',exists(select 1 from public.expense_drafts where recurring_expense_rule_id='00000000-0000-4000-8000-000000000900' and occurred_on>'2026-01-31'),
      'unclaimedOutboxSkipped',(select status='skipped_no_subscription' from public.push_outbox where id='00000000-0000-4000-8000-000000004103'),
      'liveClaimPreserved',(select body=(select to_jsonb(p) from public.push_outbox p where id='00000000-0000-4000-8000-000000004104') from live_claim_before));
    rollback;`;
}

function pausedSql() {
  const jobs = [
    ["deliver_due_reminders", ",100"],
    ["generate_recurring_drafts_cron", ",'2026-03-31',50"],
    ["drain_push_outbox", ",50"],
  ];
  const probes = jobs.map(
    ([kind, args]) => `perform private.nest_set_legacy_job_paused('${kind}',true);
      begin perform public.run_${kind}('${kind}:nest-pending-paused'${args});
        raise exception 'Paused producer/consumer executed: ${kind}';
      exception when sqlstate '55000' then
        if sqlerrm<>'Legacy job paused or control unavailable' then raise; end if;
      end;`,
  );
  return `begin; ${seedSql()}
    create temporary table pending_before as ${snapshotSql()};
    do $probe$ begin ${probes.join("\n")} end $probe$;
    do $unchanged$ begin
      update private.nest_legacy_job_control set paused=false
        where job_kind in ('deliver_due_reminders','generate_recurring_drafts_cron','drain_push_outbox');
      if (select jsonb_build_object from pending_before) is distinct from (${snapshotSql()}) then
        raise exception 'Pausing changed pending work, claims, rule cursor or history'; end if;
    end $unchanged$;
    select jsonb_build_object('entryPointsRefused',3,'pendingWorkUnchanged',true);
    rollback;`;
}
