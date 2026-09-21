-- GATED additive candidate. Only the trusted planning server may read this projection.
-- The API must authenticate the requesting actor before calling with its server credential.
-- No authenticated-client RPC, chat tool, transcript or proposal response exposes this payload.
grant select on public.household_members, public.nest_food_profiles,
  public.nest_cooking_preferences to service_role;
grant usage on schema private to service_role;

create function private.nest_meal_planning_context(p_actor uuid,p_household uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_members jsonb; v_cooking jsonb; v_goal integer; v_fingerprint jsonb;
begin
  if p_actor is null or p_household is null or not exists (
    select 1 from public.household_members where user_id=p_actor and household_id=p_household
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
  if (select count(*) from public.household_members where household_id=p_household)<>2 then
    raise exception 'Household setup incomplete' using errcode='55000';
  end if;
  select jsonb_agg(jsonb_build_object('actorId',m.user_id,'profile',
      case when f.actor_id is null then null else jsonb_build_object(
        'revision',f.revision::text,'restrictions',f.restrictions,'dislikes',f.dislikes,
        'portions',f.portions) end) order by m.user_id),
    jsonb_agg(jsonb_build_object('actor',m.user_id,'joined',extract(epoch from m.joined_at),'profile',to_jsonb(f)-'updated_at') order by m.user_id)
    into v_members,v_fingerprint
    from public.household_members m left join public.nest_food_profiles f
      on f.actor_id=m.user_id and f.household_id=m.household_id
    where m.household_id=p_household;
  select jsonb_build_object('revision',revision::text,'preferences',jsonb_build_object(
    'cookingNotes',cooking_notes,'mealSlots',meal_slots)) into v_cooking
    from public.nest_cooking_preferences where household_id=p_household;
  select calorie_goal into v_goal from public.nest_food_profiles
    where actor_id=p_actor and household_id=p_household;
  return jsonb_build_object('version',1,'actorId',p_actor,'householdId',p_household,
    'members',v_members,'cooking',v_cooking,'requesterCalorieGoal',v_goal,
    'stateHash',encode(sha256(convert_to(jsonb_build_object(
      'members',v_fingerprint,'cooking',v_cooking)::text,'UTF8')),'hex'));
end;
$$;
revoke all on function private.nest_meal_planning_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_meal_planning_context(uuid,uuid) to service_role;
create function public.nest_meal_planning_context(p_actor uuid,p_household uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_meal_planning_context($1,$2);
$$;
revoke all on function public.nest_meal_planning_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_meal_planning_context(uuid,uuid) to service_role;
