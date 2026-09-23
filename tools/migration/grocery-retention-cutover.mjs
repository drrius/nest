import assert from "node:assert/strict";
// Rollback-only proof: role revocation alone cannot stop an owner-run cron job.
// This is not a production activation command or a scheduler verification.
export function verifyGroceryRetentionCutover(db) {
  const before = snapshot(db);
  const baseline = JSON.parse(
    db.sql(`begin;
    update public.grocery_items set purchased_at=now()-interval '31 days'
      where id='00000000-0000-4000-8000-000000000812';
    set local role service_role;
    select public.run_retain_purchased_groceries('retain_purchased_groceries:nest-fixture-baseline',500);
    rollback;`),
  );
  assert.equal(baseline.decision, "run");
  assert.equal(baseline.deleted, 1);
  assert.equal(snapshot(db), before, "Baseline retention probe changed retained history");
  const signature = "public.run_retain_purchased_groceries(text,integer)";
  const result = JSON.parse(
    db.sql(`begin;
    revoke all on function ${signature} from public,anon,authenticated,service_role;
    create or replace function public.run_retain_purchased_groceries(
      p_schedule_key text, p_limit integer default 500
    ) returns jsonb language plpgsql security definer set search_path='' as $fence$
    begin raise exception using errcode='55000',message='Legacy grocery retention disabled for native cutover'; end;
    $fence$;
    do $probe$ declare v_role text; begin
      foreach v_role in array array['anon','authenticated','service_role'] loop
        if has_function_privilege(v_role,'${signature}','EXECUTE') then
          raise exception 'Retention remains callable by %',v_role; end if;
      end loop;
      begin perform public.run_retain_purchased_groceries('retain_purchased_groceries:nest-fixture-cutover',500);
        raise exception 'Owner-run retention remained active';
      exception when object_not_in_prerequisite_state then
        if sqlerrm <> 'Legacy grocery retention disabled for native cutover' then raise; end if;
      end;
    end $probe$;
    select jsonb_build_object('ownerBlocked',true,'apiRolesBlocked',true);
    rollback;`),
  );
  assert.deepEqual(result, { ownerBlocked: true, apiRolesBlocked: true });
  assert.equal(snapshot(db), before, "Retention rehearsal changed history, function or grants");
  return {
    ...result,
    legacyDeletionReproduced: true,
    rollbackVerified: true,
    schedulerVerified: false,
    activated: false,
  };
}
function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'function',(select pg_get_functiondef('public.run_retain_purchased_groceries(text,integer)'::regprocedure)),
    'acl',(select proacl from pg_proc where oid='public.run_retain_purchased_groceries(text,integer)'::regprocedure),
    'items',(select jsonb_agg(to_jsonb(i) order by id) from public.grocery_items i),
    'claims',(select jsonb_agg(to_jsonb(i) order by shopping_session_id,grocery_item_id) from public.shopping_session_items i))`);
}
