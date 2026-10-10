-- GATED additive candidate. Each member's own display colour only; no chore, meal, money or legacy-data changes.
do $$ begin
  if to_regclass('public.household_members') is null or to_regnamespace('private') is null
    or to_regprocedure('auth.uid()') is null then
    raise exception 'Nest requires the existing tenancy baseline' using errcode='55000';
  end if;
end $$;
create table public.nest_member_colours (
  actor_id uuid not null, household_id uuid not null, revision bigint not null check(revision>0),
  colour text not null check(colour in ('lake','clay','plum','rose','marigold','teal','indigo','slate')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id)
);
comment on table public.nest_member_colours is
  'Each member''s own display colour. Household members may read it; only its member can change it. Missing record means the shared default.';
create table public.nest_member_colour_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32),
  result_revision bigint not null check(result_revision>0), created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_member_colours enable row level security;
alter table public.nest_member_colour_receipts enable row level security;
revoke all on public.nest_member_colours,public.nest_member_colour_receipts from public,anon,authenticated;
grant select on public.nest_member_colours,public.nest_member_colour_receipts to authenticated;
create policy household_member_colours on public.nest_member_colours for select to authenticated
  using(exists(select 1 from public.household_members m
      where m.user_id=(select auth.uid()) and m.household_id=nest_member_colours.household_id)
    and exists(select 1 from public.household_members o
      where o.user_id=nest_member_colours.actor_id and o.household_id=nest_member_colours.household_id));
create policy own_member_colour_receipts on public.nest_member_colour_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_member_colour_receipts.household_id));

create function private.nest_save_member_colour(p_household uuid,p_operation uuid,p_expected bigint,p_colour text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_member_colour_receipts;
  v_revision bigint; v_result bigint;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_expected is null or p_expected<0 or p_colour is null
    or p_colour not in ('lake','clay','plum','rose','marigold','teal','indigo','slate') then
    raise exception 'Invalid member colour' using errcode='22023';
  end if;
  v_hash:=sha256(convert_to(jsonb_build_object('expected',p_expected::text,'colour',p_colour)::text,'UTF8'));
  -- Household-wide so two members cannot take the same colour at once.
  perform pg_advisory_xact_lock(hashtextextended('nest-member-colour:'||p_household::text,0));
  select * into v_prior from public.nest_member_colour_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Member colour operation changed' using errcode='22023'; end if;
    v_result:=v_prior.result_revision;
  else
    select revision into v_revision from public.nest_member_colours
      where actor_id=v_actor and household_id=p_household for update;
    if coalesce(v_revision,0)<>p_expected or p_expected=9223372036854775807 then
      raise exception 'Member colour changed' using errcode='PT412';
    end if;
    if exists(select 1 from public.nest_member_colours c join public.household_members m
        on m.user_id=c.actor_id and m.household_id=c.household_id
        where c.household_id=p_household and c.actor_id<>v_actor and c.colour=p_colour) then
      raise exception 'Member colour taken' using errcode='PT412';
    end if;
    v_result:=p_expected+1;
    insert into public.nest_member_colours(actor_id,household_id,revision,colour)
      values(v_actor,p_household,v_result,p_colour)
      on conflict(actor_id,household_id) do update set revision=excluded.revision,colour=excluded.colour,
        updated_at=clock_timestamp();
    insert into public.nest_member_colour_receipts(actor_id,household_id,operation_id,request_hash,result_revision)
      values(v_actor,p_household,p_operation,v_hash,v_result);
  end if;
  return jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'revision',v_result::text,'colour',p_colour);
end;
$$;
revoke all on function private.nest_save_member_colour(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function private.nest_save_member_colour(uuid,uuid,bigint,text) to authenticated;
create function public.nest_save_member_colour(p_household uuid,p_operation uuid,p_expected bigint,p_colour text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_member_colour($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_member_colour(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.nest_save_member_colour(uuid,uuid,bigint,text) to authenticated;
