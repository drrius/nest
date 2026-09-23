import assert from "node:assert/strict";
import { financialApprovalProbe } from "./financial-approval-cutover.mjs";
import { save } from "../../tests/database/native-expense-helpers.mjs";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
const signatures = [
  "post_manual_expense(uuid,text,bigint,uuid,jsonb,date,text,uuid,text,text)",
  "post_contextual_expense(uuid,text,bigint,uuid,jsonb,date,text,text,uuid,uuid,text,text,uuid)",
  "post_refund(uuid,bigint,jsonb,date,text,text,text)",
  "record_settlement(uuid,uuid,bigint,date,text,text,text,text)",
  "correct_financial_event(uuid,text,jsonb)",
  "establish_opening_balance(uuid,uuid,bigint,date,text,text,text)",
  "confirm_expense_draft(uuid,text,bigint,uuid,jsonb,date,uuid,text,text)",
  "dismiss_expense_draft(uuid,text)",
];
// Reversible fixture only. Native wrappers keep owner access to audited ledger internals.
export function verifyFinancialEntryCutover(db) {
  const before = captureRehearsal(db),
    metadata = snapshot(db);
  const revokes = signatures
    .map(
      (signature) =>
        `revoke all on function public.${signature} from public,anon,authenticated,service_role;`,
    )
    .join("\n");
  const probes = signatures
    .map((signature) => {
      const [name, args] = signature.slice(0, -1).split("(");
      const call = `${name}(${args
        .split(",")
        .map((type) => `null::${type}`)
        .join(",")})`;
      return `if has_function_privilege('authenticated','public.${signature}','EXECUTE') then
      raise exception 'Legacy financial grant remains'; end if;
      begin perform public.${call}; raise exception 'Legacy financial entry remained callable';
      exception when insufficient_privilege then null; end;`;
    })
    .join("\n");
  const expression = save(1600).replace(/^select /, "");
  const result = JSON.parse(
    db.sql(`begin; ${revokes}
    set local role authenticated;
    set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
    do $probe$ begin ${probes} end $probe$;
    do $native$ declare v_before bigint; v_first jsonb; v_retry jsonb; begin
      select count(*) into v_before from public.financial_events;
      v_first:=${expression}; v_retry:=${expression};
      if v_first is distinct from v_retry then raise exception 'Native financial retry changed result'; end if;
      if (select count(*) from public.financial_events)<>v_before+1 then
        raise exception 'Native expense count mismatch'; end if;
      if (select count(*) from public.nest_expense_receipts where operation_id='00000000-0000-4000-8000-000000001600')<>1 then
        raise exception 'Native receipt count mismatch'; end if;
    end $native$;
    ${financialApprovalProbe()}
    select jsonb_build_object('nativeSaveVerified',true,'nativeRetryVerified',true,'approvalBoundaryVerified',true);
    rollback;`),
  );
  assert.deepEqual(result, {
    nativeSaveVerified: true,
    nativeRetryVerified: true,
    approvalBoundaryVerified: true,
  });
  assert.equal(compareRehearsal(before, captureRehearsal(db)).passed, true);
  assert.equal(snapshot(db), metadata, "Financial cutover rollback changed grants or receipts");
  return {
    ...result,
    restrictedEntryPoints: signatures.length,
    rollbackVerified: true,
    completeCutover: false,
  };
}
function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'acls',(select jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl) order by oid) from pg_proc where pronamespace='public'::regnamespace),
    'approvals',(select jsonb_agg(to_jsonb(a) order by id) from public.nest_action_approvals a),
    'receipts',(select jsonb_agg(to_jsonb(r) order by actor_id,household_id,operation_id) from public.nest_expense_receipts r))`);
}
