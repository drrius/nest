import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedRoutineRehearsal(db) {
  db.sql(`insert into public.areas(id,household_id,name,sort_order)
    values('${id(1200)}','${id(10)}','Synthetic area',0);
    insert into public.routines(id,household_id,title,instructions,area_id,assignment_policy,rotation_anchor_member_id,schedule_kind,schedule_rule)
    values('${id(1201)}','${id(10)}','Synthetic alternating routine','Retained instructions','${id(1200)}','alternating','${id(1)}','calendar','{"kind":"daily"}');
    insert into public.routine_occurrences(id,household_id,routine_id,due_date,original_due_date,planned_assignee_id,status,role,closed_at)
    values('${id(1210)}','${id(10)}','${id(1201)}','2026-09-21','2026-09-21','${id(1)}','completed',null,'2026-09-21T10:00:00Z'),
      ('${id(1211)}','${id(10)}','${id(1201)}','2026-09-22','2026-09-22','${id(2)}','skipped',null,'2026-09-22T10:00:00Z'),
      ('${id(1212)}','${id(10)}','${id(1201)}','2026-09-24','2026-09-23','${id(2)}','open','current',null),
      ('${id(1213)}','${id(10)}','${id(1201)}','2026-09-25','2026-09-25','${id(1)}','open','preview',null);
    insert into public.routine_completions(occurrence_id,household_id,completed_by_member_id,completed_at,completed_on,note)
    values('${id(1210)}','${id(10)}','${id(1)}','2026-09-21T10:00:00Z','2026-09-21','Retained historical note');`);
}
export function captureRoutineHistory(db) {
  return db.sql(`select jsonb_build_object(
    'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
    'occurrences',(select jsonb_agg(to_jsonb(o)-'nest_accepted_assignee_id'-'nest_assignment_revision' order by id) from public.routine_occurrences o),
    'completions',(select jsonb_agg(to_jsonb(c) order by occurrence_id) from public.routine_completions c)
  )`);
}
export function verifyRoutineRehearsal(db, before) {
  assert.equal(captureRoutineHistory(db), before, "Legacy routine history changed");
  assert.equal(
    db.sql(`select count(*) from public.routine_occurrences
    where nest_accepted_assignee_id is not null or nest_assignment_revision<>0`),
    "0",
  );
  return { passed: true, retainedRoutines: 1, retainedOccurrences: 4, retainedCompletions: 1 };
}
