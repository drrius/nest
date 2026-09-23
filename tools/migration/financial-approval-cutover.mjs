import { id, payload } from "../../tests/database/native-expense-helpers.mjs";

// Runs inside the caller's revoked-grant fixture transaction, never against production.
export function financialApprovalProbe() {
  const input = `'${JSON.stringify(payload())}'::jsonb`;
  const home = `'${id(10)}'`,
    operation = `'${id(1601)}'`;
  const call = `public.nest_execute_expense(${home},${operation},${input},v_approval)`;
  return `do $approval$ declare v_approval uuid; v_before bigint; v_first jsonb; begin
    select count(*) into v_before from public.financial_events;
    begin perform ${call}; raise exception 'Missing approval accepted';
    exception when sqlstate '55000' then null; end;
    v_approval:=public.nest_propose_action(${home},${operation},'expenses.record',1,${input});
    begin perform ${call}; raise exception 'Pending approval accepted';
    exception when sqlstate '55000' then null; end;
    if (select count(*) from public.financial_events)<>v_before then
      raise exception 'Unapproved expense posted'; end if;
    perform public.nest_decide_action(v_approval,${operation},'expenses.record',1,${input},true);
    begin
      perform public.nest_execute_expense(${home},${operation},${input}||' {"note":"tampered"}'::jsonb,v_approval);
      raise exception 'Changed approval payload accepted';
    exception when sqlstate '55000' then null; end;
    v_first:=${call};
    if v_first is distinct from ${call} then raise exception 'Approved retry changed'; end if;
    if (select count(*) from public.financial_events)<>v_before+1 then
      raise exception 'Approved expense count mismatch'; end if;
    if (select status from public.nest_action_approvals where id=v_approval)<>'consumed' then
      raise exception 'Approval not consumed'; end if;
    if (select count(*) from public.nest_expense_receipts where operation_id=${operation})<>1 then
      raise exception 'Approved receipt count mismatch'; end if;
  end $approval$;`;
}
