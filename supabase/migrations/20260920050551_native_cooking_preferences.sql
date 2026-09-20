-- GATED additive candidate. Shared cooking choices are separate from private profiles.
create function private.nest_valid_meal_slots(p_slots text[])
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_slots is not null and array_ndims(p_slots)=1 and cardinality(p_slots) between 1 and 3
    and not exists(select 1 from unnest(p_slots) slot where slot is null or slot not in ('breakfast','lunch','dinner'))
    and cardinality(p_slots)=(select count(distinct slot) from unnest(p_slots) slot);
$$;
create function private.nest_valid_cooking_notes(p_notes text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_notes is not null and length(p_notes)<=2000
    and length(p_notes)+(select count(*) from regexp_split_to_table(p_notes,'') character
      where ascii(character)>65535)<=2000;
$$;
revoke all on function private.nest_valid_meal_slots(text[]),private.nest_valid_cooking_notes(text) from public,anon,authenticated;

create table public.nest_cooking_preferences (
  household_id uuid primary key,
  revision bigint not null check(revision>0),
  cooking_notes text not null check(private.nest_valid_cooking_notes(cooking_notes)),
  meal_slots text[] not null check(private.nest_valid_meal_slots(meal_slots)),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.nest_cooking_preference_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32),
  result_revision bigint not null check(result_revision>0),
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_cooking_preferences enable row level security;
alter table public.nest_cooking_preference_receipts enable row level security;
revoke all on public.nest_cooking_preferences,public.nest_cooking_preference_receipts from public,anon,authenticated;
grant select on public.nest_cooking_preferences,public.nest_cooking_preference_receipts to authenticated;
create policy member_cooking_preferences on public.nest_cooking_preferences for select to authenticated
  using(exists(select 1 from public.household_members m where m.user_id=(select auth.uid())
    and m.household_id=nest_cooking_preferences.household_id));
create policy own_cooking_preference_receipts on public.nest_cooking_preference_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_cooking_preference_receipts.household_id));

create function private.nest_save_cooking_preferences(
  p_household uuid,p_operation uuid,p_expected bigint,p_notes text,p_slots text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_cooking_preference_receipts;
  v_revision bigint; v_result bigint;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_expected is null or p_expected<0
    or not private.nest_valid_cooking_notes(p_notes) or not private.nest_valid_meal_slots(p_slots) then
    raise exception 'Invalid cooking preferences' using errcode='22023';
  end if;
  v_hash:=sha256(convert_to(jsonb_build_object('expected',p_expected::text,'notes',p_notes,'slots',p_slots)::text,'UTF8'));
  -- Both partners serialize on the household, including first setup with no row.
  perform pg_advisory_xact_lock(hashtextextended('nest-cooking:'||p_household::text,0));
  select * into v_prior from public.nest_cooking_preference_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Cooking preference operation changed' using errcode='22023'; end if;
    v_result:=v_prior.result_revision;
  else
    select revision into v_revision from public.nest_cooking_preferences where household_id=p_household for update;
    if coalesce(v_revision,0)<>p_expected then raise exception 'Cooking preferences changed' using errcode='40001'; end if;
    v_result:=p_expected+1;
    insert into public.nest_cooking_preferences(household_id,revision,cooking_notes,meal_slots)
      values(p_household,v_result,p_notes,p_slots)
      on conflict(household_id) do update set revision=excluded.revision,cooking_notes=excluded.cooking_notes,
        meal_slots=excluded.meal_slots,updated_at=clock_timestamp();
    insert into public.nest_cooking_preference_receipts(actor_id,household_id,operation_id,request_hash,result_revision)
      values(v_actor,p_household,p_operation,v_hash,v_result);
  end if;
  return jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,'revision',v_result::text);
end;
$$;
revoke all on function private.nest_save_cooking_preferences(uuid,uuid,bigint,text,text[]) from public,anon,authenticated;
grant execute on function private.nest_save_cooking_preferences(uuid,uuid,bigint,text,text[]) to authenticated;
create function public.nest_save_cooking_preferences(
  p_household uuid,p_operation uuid,p_expected bigint,p_notes text,p_slots text[]
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_cooking_preferences($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_save_cooking_preferences(uuid,uuid,bigint,text,text[]) from public,anon,authenticated;
grant execute on function public.nest_save_cooking_preferences(uuid,uuid,bigint,text,text[]) to authenticated;
