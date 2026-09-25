import assert from "node:assert/strict";
const jobs = [
  ["deliver_due_reminders", "public.run_deliver_due_reminders", ",100"],
  ["deliver_member_digests", "public.run_deliver_member_digests", ",'08:00'::time,50"],
  ["ensure_due_occurrences", "public.run_ensure_due_occurrences", ",50"],
  [
    "generate_recurring_drafts_cron",
    "public.run_generate_recurring_drafts_cron",
    ",current_date,50",
  ],
  ["retain_activity_events", "public.run_retain_activity_events", ",500"],
  ["retain_purchased_groceries", "public.run_retain_purchased_groceries", ",500"],
  ["drain_push_outbox", "public.run_drain_push_outbox", ",50"],
  ["invoke_push_dispatch", "private.invoke_push_dispatch", null],
];
export function verifyLegacyJobPause(db) {
  const before = snapshot(db);
  const probes = jobs
    .map(
      ([kind, name, args]) => `
    perform private.nest_set_legacy_job_paused('${kind}',true);
    begin perform ${name}(${args === null ? "" : `'${kind}:nest-paused-fixture'${args}`});
      raise exception 'Paused legacy job executed: ${kind}';
    exception when sqlstate '55000' then
      if sqlerrm<>'Legacy job paused or control unavailable' then raise; end if;
    end;`,
    )
    .join("\n");
  db.sql(`begin;
    do $pause$ begin ${probes} end $pause$;
    do $roles$ declare v_role text; begin
      foreach v_role in array array['anon','authenticated','service_role'] loop
        execute format('set local role %I',v_role);
        begin perform private.nest_set_legacy_job_paused('ensure_due_occurrences',false);
          raise exception 'API role changed pause';
        exception when insufficient_privilege then null; end;
        execute 'reset role';
      end loop;
    end $roles$;
    rollback;`);
  assert.equal(snapshot(db), before, "Legacy pause probe changed controls or claims");
  return {
    entryPointsRefused: jobs.length,
    apiControlDenied: true,
    rollbackVerified: true,
    schedulerVerified: false,
    externalRequestsDrained: false,
  };
}
function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'controls',(select jsonb_agg(to_jsonb(c) order by job_kind) from private.nest_legacy_job_control c),
    'claims',(select jsonb_agg(to_jsonb(j) order by schedule_key) from public.job_claims j))`);
}
