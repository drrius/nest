import { pauseLegacyJobsSql } from "./legacy-job-pause-rehearsal.mjs";
import { legacyApiFenceSql } from "./legacy-api-fence.mjs";

// Only for the caller-owned disposable final recovery fixture.
export function freezeRecoveryFixture(db) {
  db.sql(`begin;
    select private.nest_set_recurring_execution_paused(true);
    ${pauseLegacyJobsSql()}
    ${legacyApiFenceSql()}
    do $freeze$ declare v_function record; v_role text; begin
      for v_function in select oid,oid::regprocedure::text as signature from pg_proc
        where pronamespace='public'::regnamespace and prokind='f'
          and left(proname,5)='nest_' and oid not in (
            'public.nest_money_balance(uuid)'::regprocedure,
            'public.nest_money_history(uuid,uuid)'::regprocedure,
            'public.nest_read_expense_approval(uuid,uuid)'::regprocedure,
            'public.nest_read_settlement_approval(uuid,uuid)'::regprocedure,
            'public.nest_read_settlement_save(uuid,uuid)'::regprocedure,
            'public.nest_read_refund_save(uuid,uuid)'::regprocedure,
            'public.nest_read_correction_save(uuid,uuid)'::regprocedure,
            'public.nest_read_recurring_save(uuid,uuid)'::regprocedure,
            'public.nest_read_recurring_state_save(uuid,uuid)'::regprocedure,
            'public.nest_read_recurring_cycle_save(uuid,uuid)'::regprocedure,
            'public.nest_read_expense_save(uuid,uuid)'::regprocedure) loop
        execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function.signature);
        foreach v_role in array array['anon','authenticated','service_role'] loop
          if has_function_privilege(v_role,v_function.oid,'EXECUTE') then
            raise exception 'Native API remains callable: %',v_function.signature;
          end if;
        end loop;
      end loop;
    end $freeze$; commit;`);
}
