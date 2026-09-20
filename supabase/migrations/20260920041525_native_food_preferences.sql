-- GATED additive candidate. Owner-private food preferences, never member-table fields.
-- Missing rows mean setup is unconfirmed, not that the member has no restrictions.
create function private.nest_valid_food_texts(p_values text[])
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_values is not null and coalesce(array_ndims(p_values),1)=1
    and cardinality(p_values)<=32 and not exists(
      select 1 from unnest(p_values) item where item is null or length(item)>120
        or item ~ '^[[:space:]]*$'
    );
$$;
revoke all on function private.nest_valid_food_texts(text[]) from public,anon,authenticated;

create table public.nest_food_profiles (
  actor_id uuid not null, household_id uuid not null,
  revision bigint not null check(revision>0),
  restrictions text[] not null check(private.nest_valid_food_texts(restrictions)),
  dislikes text[] not null check(private.nest_valid_food_texts(dislikes)),
  calorie_goal integer check(calorie_goal between 1 and 20000),
  portions numeric not null check(portions between 0.5 and 4 and portions*2=trunc(portions*2)),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id)
);
create table public.nest_food_profile_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32),
  result_revision bigint not null check(result_revision>0),
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_food_profiles enable row level security;
alter table public.nest_food_profile_receipts enable row level security;
revoke all on public.nest_food_profiles,public.nest_food_profile_receipts from public,anon,authenticated;
grant select on public.nest_food_profiles,public.nest_food_profile_receipts to authenticated;
create policy own_food_profile on public.nest_food_profiles for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_food_profiles.household_id));
create policy own_food_profile_receipts on public.nest_food_profile_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_food_profile_receipts.household_id));

create function private.nest_save_food_profile(
  p_household uuid,p_operation uuid,p_expected bigint,p_restrictions text[],p_dislikes text[],
  p_calorie_goal integer,p_portions numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_food_profile_receipts;
  v_revision bigint; v_result bigint;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_expected is null or p_expected<0
    or not private.nest_valid_food_texts(p_restrictions) or not private.nest_valid_food_texts(p_dislikes)
    or (p_calorie_goal is not null and p_calorie_goal not between 1 and 20000)
    or p_portions is null or p_portions not between 0.5 and 4 or p_portions*2<>trunc(p_portions*2) then
    raise exception 'Invalid food preferences' using errcode='22023';
  end if;
  v_hash:=sha256(convert_to(jsonb_build_object('expected',p_expected::text,'restrictions',p_restrictions,
    'dislikes',p_dislikes,'calorieGoal',p_calorie_goal,'portions',p_portions)::text,'UTF8'));
  -- Serialize both first saves and updates without creating an unconfirmed default row.
  perform pg_advisory_xact_lock(hashtextextended('nest-food-profile:'||p_household::text||':'||v_actor::text,0));
  select * into v_prior from public.nest_food_profile_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Food preference operation changed' using errcode='22023'; end if;
    v_result:=v_prior.result_revision;
  else
    select revision into v_revision from public.nest_food_profiles
      where actor_id=v_actor and household_id=p_household for update;
    if coalesce(v_revision,0)<>p_expected then raise exception 'Food preferences changed' using errcode='40001'; end if;
    v_result:=p_expected+1;
    insert into public.nest_food_profiles(actor_id,household_id,revision,restrictions,dislikes,calorie_goal,portions)
      values(v_actor,p_household,v_result,p_restrictions,p_dislikes,p_calorie_goal,p_portions)
      on conflict(actor_id,household_id) do update set revision=excluded.revision,
        restrictions=excluded.restrictions,dislikes=excluded.dislikes,calorie_goal=excluded.calorie_goal,
        portions=excluded.portions,updated_at=clock_timestamp();
    insert into public.nest_food_profile_receipts(actor_id,household_id,operation_id,request_hash,result_revision)
      values(v_actor,p_household,p_operation,v_hash,v_result);
  end if;
  return jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,'revision',v_result::text);
end;
$$;
revoke all on function private.nest_save_food_profile(uuid,uuid,bigint,text[],text[],integer,numeric) from public,anon,authenticated;
grant execute on function private.nest_save_food_profile(uuid,uuid,bigint,text[],text[],integer,numeric) to authenticated;
create function public.nest_save_food_profile(
  p_household uuid,p_operation uuid,p_expected bigint,p_restrictions text[],p_dislikes text[],
  p_calorie_goal integer,p_portions numeric
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_food_profile($1,$2,$3,$4,$5,$6,$7);
$$;
revoke all on function public.nest_save_food_profile(uuid,uuid,bigint,text[],text[],integer,numeric) from public,anon,authenticated;
grant execute on function public.nest_save_food_profile(uuid,uuid,bigint,text[],text[],integer,numeric) to authenticated;
