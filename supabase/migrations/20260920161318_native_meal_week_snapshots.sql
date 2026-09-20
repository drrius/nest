-- GATED additive candidate. No meal, recipe, grocery or financial record is rewritten.
-- Untouched legacy weeks have revision zero; every subsequent entry write advances it.
create table public.nest_meal_week_revisions (
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null check (isfinite(week_start) and extract(isodow from week_start)=1),
  revision bigint not null check (revision>0),
  primary key (household_id,week_start)
);
alter table public.nest_meal_week_revisions enable row level security;
revoke all on public.nest_meal_week_revisions from public,anon,authenticated,service_role;
grant select on public.nest_meal_week_revisions to authenticated;
create policy "members read meal week revisions" on public.nest_meal_week_revisions
  for select to authenticated using ((select private.is_household_member(household_id)));

-- Trigger-only definer: entry writers are authorized by their existing command/RLS.
-- No caller can invoke this function or write counters directly. Both sides of a
-- move advance in deterministic order; rollback includes the counters.
-- Preserve legacy writes outside the native complete-week range (including infinity):
-- only a representable side needs a counter; reads reject unsupported weeks.
create function private.nest_advance_meal_weeks()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_home uuid; v_week date; v_old_home uuid; v_old_week date;
  v_new_home uuid; v_new_week date;
begin
  if tg_op<>'INSERT' and old.date between date '0001-01-01' and date '9999-12-26' then
    v_old_home:=old.household_id;
    v_old_week:=old.date-(extract(isodow from old.date)::integer-1);
  end if;
  if tg_op<>'DELETE' and new.date between date '0001-01-01' and date '9999-12-26' then
    v_new_home:=new.household_id;
    v_new_week:=new.date-(extract(isodow from new.date)::integer-1);
  end if;
  for v_home,v_week in
    select distinct h,w from (values(v_old_home,v_old_week),(v_new_home,v_new_week)) weeks(h,w)
    where h is not null order by h,w
  loop
    insert into public.nest_meal_week_revisions(household_id,week_start,revision)
      select v_home,v_week,1 where exists(select 1 from public.households where id=v_home)
    on conflict(household_id,week_start) do update
      set revision=public.nest_meal_week_revisions.revision+1;
  end loop;
  return null;
end;
$$;
revoke all on function private.nest_advance_meal_weeks() from public,anon,authenticated,service_role;
create trigger nest_meal_entries_advance_weeks after insert or update or delete
  on public.meal_plan_entries for each row execute function private.nest_advance_meal_weeks();

create function private.nest_meal_week_snapshot(p_household uuid,p_week_start text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_week date; v_revision bigint; v_entries jsonb;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_week_start is null or p_week_start !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid meal week' using errcode='22023';
  end if;
  begin
    v_week:=p_week_start::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid meal week' using errcode='22023';
  end;
  if v_week<'0001-01-01'::date or v_week>'9999-12-20'::date
    or extract(isodow from v_week)<>1 or to_char(v_week,'YYYY-MM-DD')<>p_week_start then
    raise exception 'Invalid meal week' using errcode='22023';
  end if;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week;
  select coalesce(jsonb_agg(row.value order by row.date,row.slot_order),'[]'::jsonb) into v_entries
  from (
    select e.date,case e.slot when 'breakfast' then 1 when 'lunch' then 2 else 3 end as slot_order,
      jsonb_build_object('entryId',e.id,'date',e.date,'slot',e.slot,'title',e.title_snapshot,
        'recipeUrl',e.recipe_url_snapshot,'notes',e.notes,'definitionId',e.meal_definition_id,
        'leftoverSourceId',e.leftover_of_entry_id) as value
    from public.meal_plan_entries e
    where e.household_id=p_household and e.date between v_week and v_week+6
      and e.slot is not null and e.removed_at is null order by e.date,slot_order limit 22
  ) row;
  if jsonb_array_length(v_entries)>21 then
    raise exception 'Invalid meal week contents' using errcode='22023';
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'weekStart',v_week,
    'revision',coalesce(v_revision,0)::text,'entries',v_entries);
end;
$$;
revoke all on function private.nest_meal_week_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function private.nest_meal_week_snapshot(uuid,text) to authenticated;
create function public.nest_meal_week_snapshot(p_household uuid,p_week_start text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_meal_week_snapshot($1,$2);
$$;
revoke all on function public.nest_meal_week_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function public.nest_meal_week_snapshot(uuid,text) to authenticated;
