// Generates one reviewed conversion transaction; never opens a database connection.
export function renewalConversionSql({ householdId, commitmentId, operationId, sourceHash }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (
    ![householdId, commitmentId, operationId].every(
      (value) => typeof value === "string" && uuid.test(value),
    ) ||
    typeof sourceHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(sourceHash)
  )
    throw new Error("Invalid reviewed conversion identity");
  return `begin;
    do $conversion$
    declare source public.household_commitments;
    begin
      select * into source from public.household_commitments
        where household_id='${householdId}' and id='${commitmentId}' for update;
      if not found or encode(sha256(convert_to(to_jsonb(source)::text,'UTF8')),'hex') <> '${sourceHash}' then
        raise exception 'Reviewed commitment changed';
      end if;
      if source.archived_at is not null or source.status <> 'active' or source.renewal_on is null
        or source.recurring_expense_rule_id is not null then
        raise exception 'Commitment requires separate migration review';
      end if;
      perform public.nest_save_renewal('${householdId}','${operationId}',jsonb_build_object(
        'renewalId',source.id,'expectedRevision',null,'fields',jsonb_build_object(
          'title',source.title,'renewalOn',source.renewal_on::text,'noticeDays',source.notice_days,
          'responsibleId',source.responsible_member_id,'recurringRuleId',null)));
    end;
    $conversion$;
    commit;`;
}
