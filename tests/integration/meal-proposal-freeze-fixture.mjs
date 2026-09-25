import {
  installFixtureWriteBarrier,
  setFixtureWritesFrozen,
} from "../../tools/migration/write-barrier-fixture.mjs";

// Disposable database only. Keep owner reads; suspend mutation and expiry entry points.
export function freezeProposals(db) {
  installFixtureWriteBarrier(db);
  setFixtureWritesFrozen(db, true);
  db.sql(`revoke all on function
    public.nest_read_proposal_edit(uuid,uuid),
    public.nest_begin_proposal_edit(uuid,uuid,jsonb),
    public.nest_recover_meal_proposal(uuid,uuid),
    public.nest_approve_meal_proposal(uuid,uuid,jsonb),
    public.nest_discard_meal_proposal(uuid,uuid,jsonb),
    public.nest_begin_meal_proposal(uuid,uuid,jsonb),
    public.nest_open_meal_proposal(uuid,uuid)
    from public,anon,authenticated,service_role;`);
}

export function proposalSnapshot(db) {
  return db.sql(`select jsonb_build_object(
    'proposals',(select jsonb_agg(to_jsonb(p) order by proposal_id) from private.nest_meal_proposals p),
    'edits',(select jsonb_agg(to_jsonb(e) order by operation_id) from private.nest_meal_proposal_edits e),
    'jobs',(select jsonb_agg(to_jsonb(j) order by proposal_id) from private.nest_meal_proposal_jobs j),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.nest_meal_proposal_receipts r),
    'meals',(select jsonb_agg(to_jsonb(m) order by id) from public.meal_plan_entries m))`);
}
