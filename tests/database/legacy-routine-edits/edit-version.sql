-- Audited test-only source excerpts from household-os 4a528c9.
-- Definition edits are commands. API clients cannot bypass their edit baseline.
revoke execute on function public.update_routine_definition(uuid,text,text,uuid,uuid,text,uuid,uuid,text,jsonb,text,date,date,boolean) from public, anon, authenticated;
revoke update (title,instructions,area_id,pet_id,priority) on public.routines from authenticated;

create table private.routine_edit_receipts (
 household_id uuid not null references public.households(id),
 idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 200),
 request_payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key (household_id,idempotency_key)
);
alter table private.routine_edit_receipts enable row level security;
revoke all on private.routine_edit_receipts from public, anon, authenticated;

-- Transient, command-owned intent lets the installed primitive retain its original
-- row for recurrence and notification comparisons while applying explicit NULLs.
create table private.routine_edit_clear_intents (
 household_id uuid not null,
 routine_id uuid primary key,
 clear_instructions boolean not null,
 clear_window boolean not null,
 foreign key (household_id,routine_id) references public.routines(household_id,id),
 check (clear_instructions or clear_window)
);
alter table private.routine_edit_clear_intents enable row level security;
revoke all on private.routine_edit_clear_intents from public, anon, authenticated;

create function private.apply_routine_edit_clears()
returns trigger language plpgsql security definer set search_path = '' as $$
declare intent private.routine_edit_clear_intents%rowtype;
begin
 delete from private.routine_edit_clear_intents
 where household_id=old.household_id and routine_id=old.id returning * into intent;
 if found then
  if intent.clear_instructions then new.instructions := null; end if;
  if intent.clear_window then
   new.active_from := null;
   new.active_until := null;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.apply_routine_edit_clears() from public, anon, authenticated;
create trigger apply_routine_edit_clears before update on public.routines
 for each row execute function private.apply_routine_edit_clears();

-- Pause/resume and repeated edits must not reuse a version within one transaction.
create or replace function private.set_routine_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
 new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
 return new;
end;
$$;
revoke all on function private.set_routine_updated_at() from public, anon, authenticated;

create function public.edit_routine_definition(
 p_routine_id uuid,
 p_expected_updated_at timestamptz,
 p_idempotency_key text,
 p_patch jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 routine public.routines%rowtype;
 request_payload jsonb;
 receipt private.routine_edit_receipts%rowtype;
 result jsonb;
 next_area uuid;
 next_pet uuid;
 next_policy text;
 next_assigned uuid;
 next_rotation uuid;
 next_kind text;
 next_rule jsonb;
 next_from date;
 next_until date;
 rebuild boolean;
 clear_instructions boolean;
 clear_window boolean;
begin
 select * into routine from public.routines where id=p_routine_id;
 if not found then raise exception 'Routine does not exist' using errcode='P0002'; end if;
 if auth.uid() is null or not private.is_household_member(routine.household_id) then
  raise exception 'Caller cannot edit this routine' using errcode='42501';
 end if;
 if p_expected_updated_at is null then
  raise exception 'Reload this routine before editing' using errcode='22023';
 end if;
 if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200 then
  raise exception 'Invalid routine edit key' using errcode='22023';
 end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or
   p_patch - array['title','instructions','area_id','pet_id','assignment_policy','assigned_member_id','rotation_anchor_member_id','schedule_kind','schedule_rule','priority','active_from','active_until','rebuild_window'] <> '{}'::jsonb then
  raise exception 'Invalid routine edit fields' using errcode='22023';
 end if;
 request_payload := jsonb_build_object('routine_id',p_routine_id,'expected_updated_at',p_expected_updated_at,'patch',p_patch);
 perform pg_advisory_xact_lock(hashtextextended('routine-edit:' || routine.household_id::text || ':' || p_idempotency_key,0));
 select * into receipt from private.routine_edit_receipts
 where household_id=routine.household_id and idempotency_key=p_idempotency_key;
 if found then
  if receipt.request_payload <> request_payload then
   raise exception 'Routine edit key was already used for different changes' using errcode='22023';
  end if;
  return receipt.result;
 end if;

 -- Closure locks current -> routine -> preview. Ordinary edits must do so too.
 -- A closure may replace the current row while this SELECT waits; a background
 -- window rebuild may already hold the routine. Never wait on those later locks
 -- while holding the earlier occurrence: return a retryable conflict instead.
 perform 1 from public.routine_occurrences
 where routine_id=p_routine_id and status='open' and role='current' for update;
 select * into routine from public.routines where id=p_routine_id for update nowait;
 -- Claim a newly replaced current and the preview without reversing a concurrent
 -- closure's blocking order. Also cover the linked-preparation primitive's rows.
 perform 1 from public.routine_occurrences
 where routine_id=p_routine_id and (status='open' or meal_plan_entry_id is not null)
 order by case when role='current' then 0 when role='preview' then 1 else 2 end,id
 for update nowait;
 if routine.updated_at is distinct from p_expected_updated_at then
  raise exception 'This routine changed. Reopen it before saving.' using errcode='40001';
 end if;
 next_area := coalesce((p_patch->>'area_id')::uuid,routine.area_id);
 next_pet := case when p_patch ? 'pet_id' then (p_patch->>'pet_id')::uuid else routine.pet_id end;
 next_policy := coalesce(p_patch->>'assignment_policy',routine.assignment_policy);
 next_assigned := case when p_patch->>'assignment_policy' is not null or p_patch ? 'assigned_member_id'
   then (p_patch->>'assigned_member_id')::uuid else routine.assigned_member_id end;
 next_rotation := case when p_patch->>'assignment_policy' is not null or p_patch ? 'rotation_anchor_member_id'
   then (p_patch->>'rotation_anchor_member_id')::uuid else routine.rotation_anchor_member_id end;
 next_kind := coalesce(p_patch->>'schedule_kind',routine.schedule_kind);
 next_rule := coalesce(nullif(p_patch->'schedule_rule','null'::jsonb),routine.schedule_rule);
 next_from := case when p_patch ? 'active_from' then (p_patch->>'active_from')::date else routine.active_from end;
 next_until := case when p_patch ? 'active_until' then (p_patch->>'active_until')::date else routine.active_until end;
 rebuild := coalesce((p_patch->>'rebuild_window')::boolean,false)
   or next_kind is distinct from routine.schedule_kind
   or next_rule is distinct from routine.schedule_rule
   or next_policy is distinct from routine.assignment_policy
   or next_assigned is distinct from routine.assigned_member_id
   or next_rotation is distinct from routine.rotation_anchor_member_id
   or next_from is distinct from routine.active_from
   or next_until is distinct from routine.active_until;
 clear_instructions := p_patch ? 'instructions' and p_patch->'instructions'='null'::jsonb;
 clear_window := (p_patch ? 'active_from' or p_patch ? 'active_until') and next_from is null and next_until is null
  -- Linked preparation owns a one-day window; the installed primitive enforces it.
  and not exists(select 1 from public.routine_occurrences where routine_id=p_routine_id and meal_plan_entry_id is not null);
 -- The trigger consumes this intent during the primitive's single row update.
 if clear_instructions or clear_window then
  insert into private.routine_edit_clear_intents(household_id,routine_id,clear_instructions,clear_window)
  values(routine.household_id,routine.id,clear_instructions,clear_window);
 end if;
 result := public.update_routine_definition(
  p_routine_id=>p_routine_id,
  p_title=>p_patch->>'title', p_instructions=>p_patch->>'instructions',
  p_area_id=>next_area, p_pet_id=>next_pet,
  p_assignment_policy=>next_policy, p_assigned_member_id=>next_assigned, p_rotation_anchor_member_id=>next_rotation,
  p_schedule_kind=>next_kind, p_schedule_rule=>next_rule, p_priority=>p_patch->>'priority',
  p_active_from=>next_from, p_active_until=>next_until, p_rebuild_window=>rebuild
 );
 result := result || jsonb_build_object('updated_at',(select updated_at from public.routines where id=p_routine_id));
 insert into private.routine_edit_receipts(household_id,idempotency_key,request_payload,result)
 values(routine.household_id,p_idempotency_key,request_payload,result);
 return result;
end;
$$;
revoke all on function public.edit_routine_definition(uuid,timestamptz,text,jsonb) from public, anon;
grant execute on function public.edit_routine_definition(uuid,timestamptz,text,jsonb) to authenticated;

create trigger set_routine_updated_at before update on public.routines for each row execute function private.set_routine_updated_at();
