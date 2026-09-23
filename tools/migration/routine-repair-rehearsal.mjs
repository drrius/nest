import assert from "node:assert/strict";
import { captureRoutineHistory } from "./routine-rehearsal.mjs";

// Repair only newly created synthetic occurrences; the transaction always rolls back.
export function verifyRoutineRepair(db) {
  const before = captureRoutineHistory(db);
  const claims = db.sql(
    "select coalesce(jsonb_agg(to_jsonb(j) order by schedule_key),'[]') from public.job_claims j",
  );
  const result = JSON.parse(
    db.sql(`begin;
    set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
    create temporary table repair_expected(routine_id uuid, expected jsonb);
    do $seed$ declare v_assignment jsonb; v_receipt jsonb; v_id uuid; begin
      foreach v_assignment in array array[
        '{"policy":"shared"}'::jsonb,
        '{"policy":"assigned","memberId":"00000000-0000-4000-8000-000000000002"}'::jsonb,
        '{"policy":"alternating","anchorMemberId":"00000000-0000-4000-8000-000000000001"}'::jsonb
      ] loop
        v_receipt:=public.nest_create_routine('00000000-0000-4000-8000-000000000010',
          extensions.gen_random_uuid(),jsonb_build_object('title','Synthetic repair routine',
            'schedule','{"kind":"daily"}'::jsonb,'assignment',v_assignment));
        v_id:=(v_receipt->>'routineId')::uuid;
        insert into repair_expected select v_id,${occurrences("v_id")};
        delete from public.routine_occurrences where routine_id=v_id;
      end loop;
    end $seed$;
    do $repair$ declare v_first jsonb; v_retry jsonb; v_next jsonb; v_row record; begin
      v_first:=public.run_ensure_due_occurrences('ensure_due_occurrences:nest-repair-fixture',50);
      if v_first->>'decision'<>'run' or (v_first->>'ensured')::integer<>3 then
        raise exception 'Repair did not handle all three routines: %',v_first; end if;
      v_retry:=public.run_ensure_due_occurrences('ensure_due_occurrences:nest-repair-fixture',50);
      if v_retry->>'decision'<>'already_succeeded' then raise exception 'Repair retry not deduplicated'; end if;
      v_next:=public.run_ensure_due_occurrences('ensure_due_occurrences:nest-repair-fixture-next',50);
      if (v_next->>'ensured')::integer<>0 then raise exception 'Repair recreated existing windows'; end if;
      for v_row in select * from repair_expected loop
        if v_row.expected is distinct from ${occurrences("v_row.routine_id")} then
          raise exception 'Repair changed native dates or assignment'; end if;
      end loop;
    end $repair$;
    select jsonb_build_object('policiesVerified',3,'retryVerified',true,'nextRunNoop',true);
    rollback;`),
  );
  assert.equal(
    captureRoutineHistory(db),
    before,
    "Repair rehearsal changed retained routine history",
  );
  assert.equal(
    db.sql(
      "select coalesce(jsonb_agg(to_jsonb(j) order by schedule_key),'[]') from public.job_claims j",
    ),
    claims,
  );
  return {
    ...result,
    rollbackVerified: true,
    schedulerVerified: false,
    completeCompatibility: false,
  };
}

function occurrences(routine) {
  return `(select jsonb_agg(jsonb_build_object('role',role,'status',status,'due',due_date,
    'original',original_due_date,'assignee',planned_assignee_id,
    'accepted',nest_accepted_assignee_id,'assignmentRevision',nest_assignment_revision) order by role)
    from public.routine_occurrences where routine_id=${routine})`;
}
