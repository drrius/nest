create or replace function private.require_money_actor(p_household_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid := auth.uid();
begin
  if actor_member_id is null
    or not private.is_household_member(p_household_id)
  then
    raise exception 'caller is not a member of household %', p_household_id
      using errcode = '42501';
  end if;
  return actor_member_id;
end;
$$;

create or replace function private.other_household_member(
  p_household_id uuid,
  p_member_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  other_member_id uuid;
  member_count integer;
begin
  select count(*)::integer
  into member_count
  from public.household_members as member
  where member.household_id = p_household_id;

  select member.user_id
  into other_member_id
  from public.household_members as member
  where member.household_id = p_household_id
    and member.user_id <> p_member_id
  limit 1;

  if member_count <> 2 or other_member_id is null then
    raise exception 'money commands require exactly two household members'
      using errcode = '23514';
  end if;
  return other_member_id;
end;
$$;

create or replace function private.validate_money_allocations(
  p_household_id uuid,
  p_amount_cents bigint,
  p_allocations jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  allocation jsonb;
  allocation_count integer := 0;
  allocation_total numeric := 0;
  distinct_member_count integer;
begin
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'allocations must be a JSON array'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_allocations) <> 2 then
    raise exception 'allocations must contain both household members'
      using errcode = '22023';
  end if;

  for allocation in select value from jsonb_array_elements(p_allocations)
  loop
    if jsonb_typeof(allocation) <> 'object'
      or jsonb_typeof(allocation -> 'memberId') <> 'string'
      or jsonb_typeof(allocation -> 'allocatedCents') <> 'number'
      or (allocation ->> 'allocatedCents') !~ '^[0-9]+$'
      or (allocation ->> 'allocatedCents')::numeric > 9007199254740991
    then
      raise exception 'each allocation requires a memberId and safe integer allocatedCents'
        using errcode = '22023';
    end if;
    allocation_count := allocation_count + 1;
    allocation_total :=
      allocation_total + (allocation ->> 'allocatedCents')::numeric;
  end loop;

  select count(distinct member.user_id)::integer
  into distinct_member_count
  from public.household_members as member
  join jsonb_to_recordset(p_allocations)
    as item("memberId" uuid, "allocatedCents" bigint)
    on item."memberId" = member.user_id
  where member.household_id = p_household_id;

  if allocation_count <> 2 or distinct_member_count <> 2 then
    raise exception 'allocations must name both household members exactly once'
      using errcode = '22023';
  end if;
  if allocation_total <> p_amount_cents then
    raise exception 'allocation total must equal amount_cents'
      using errcode = '23514';
  end if;
end;
$$;
