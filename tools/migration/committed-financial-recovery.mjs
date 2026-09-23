import assert from "node:assert/strict";
import { as, id, save } from "../../tests/database/native-expense-helpers.mjs";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { legacyApiFenceSql } from "./legacy-api-fence.mjs";

// Last fixture step: commit new history, then restrict APIs without restoring old data.
// The caller owns a disposable cluster and destroys it after the report.
export function verifyCommittedFinancialRecovery(db) {
  const original = captureRehearsal(db);
  const receipt = JSON.parse(db.sql(as(1, save(1700))));
  const committed = captureRehearsal(db);
  assert.equal(
    committed.financial.tables.financial_events.length,
    original.financial.tables.financial_events.length + 1,
  );
  const reads = readFinancialState(db);
  for (const read of reads)
    assert.equal(
      read.history.events.some((event) => event.eventId === receipt.eventId),
      true,
    );
  db.sql(`begin; ${legacyApiFenceSql()}
    do $freeze$ declare v_function record; v_role text; begin
      for v_function in select oid,oid::regprocedure::text as signature from pg_proc
        where pronamespace='public'::regnamespace and prokind='f'
          and left(proname,5)='nest_' and oid not in (
            'public.nest_money_balance(uuid)'::regprocedure,
            'public.nest_money_history(uuid,uuid)'::regprocedure,
            'public.nest_read_expense_save(uuid,uuid)'::regprocedure) loop
        execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function.signature);
        foreach v_role in array array['anon','authenticated','service_role'] loop
          if has_function_privilege(v_role,v_function.oid,'EXECUTE') then
            raise exception 'Native API remains callable: %',v_function.signature;
          end if;
        end loop;
      end loop;
    end $freeze$; commit;`);
  assert.throws(
    () => db.sql(as(1, save(1701))),
    /permission denied for function nest_save_expense/,
  );
  assert.deepEqual(readFinancialState(db), reads);
  const recovered = JSON.parse(
    db.sql(as(1, `select public.nest_read_expense_save('${id(10)}','${id(1700)}')`)),
  );
  assert.equal(recovered.status, "recorded");
  assert.deepEqual(recovered.receipt, receipt);
  assert.equal(compareRehearsal(committed, captureRehearsal(db)).passed, true);
  assert.throws(
    () => db.sql(as(3, `select public.nest_money_history('${id(10)}')`)),
    /Not authorized/,
  );
  return {
    committedExpensePreserved: true,
    financialReadsPreserved: true,
    receiptRecoveryPreserved: true,
    newExpenseRefused: true,
    outsiderDenied: true,
    restoredOldDatabase: false,
    ownerJobsStopped: false,
    completeRecovery: false,
  };
}

function readFinancialState(db) {
  return [1, 2].map((actor) =>
    JSON.parse(
      db.sql(
        as(
          actor,
          `select jsonb_build_object('balance',public.nest_money_balance('${id(10)}'),
      'history',public.nest_money_history('${id(10)}'))`,
        ),
      ),
    ),
  );
}
