// Read-only conversion inventory. Produces no renewal, mandate or reminder writes.
export function planLegacyRenewals(sql) {
  return JSON.parse(
    sql(`select coalesce(jsonb_agg(to_jsonb(p) order by household_id,id),'[]') from (
    select c.household_id,c.id,
      encode(sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex') as source_hash,
      case when c.archived_at is not null or c.status='ended' then 'retain-history'
        when c.status='cancel_requested' then 'cancellation-review'
        when length(c.title) not between 1 and 160 or c.title<>btrim(c.title,
          (select string_agg(chr(n),'') from unnest(array[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]) n)) then 'title-review'
        when c.renewal_on is null then 'no-renewal-date'
        when not isfinite(c.renewal_on) or c.renewal_on not between date '0001-01-01' and date '9999-12-31'
          or c.renewal_on < date '0001-01-01'+c.notice_days then 'date-review'
        when c.recurring_expense_rule_id is not null and a.native_rule_id is null then 'legacy-link-review'
        else 'ready' end as disposition,
      a.native_rule_id
    from public.household_commitments c
    left join private.nest_legacy_recurring_adoptions a
      on a.household_id=c.household_id and a.legacy_rule_id=c.recurring_expense_rule_id
  ) p`),
  );
}
