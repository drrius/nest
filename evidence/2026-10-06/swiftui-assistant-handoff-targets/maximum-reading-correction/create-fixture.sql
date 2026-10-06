-- nest-test only: one synthetic private UI fixture, no turn/model/domain command.
begin;
set local lock_timeout='5s';
set local statement_timeout='10s';
do $fixture$
begin
  if (select array_agg(user_id::text order by user_id) from public.household_members
      where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'::uuid)
      is distinct from array['791f7261-6c9d-4061-9c8a-57aa6e0b0200','e5f80cfd-b69a-4aa0-a267-75784e943676']::text[] then
    raise exception 'Not the authorized fictional household' using errcode='55000';
  end if;
  if (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]'))
      from public.nest_ai_conversations c
      where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'::uuid
        and id<>'4c528a2f-42a3-4e3d-a909-5a0ff7f106da'::uuid)
      is distinct from '7284c1c22df502cc7fb70a8b9ff0e903' then
    raise exception 'Original conversations changed; stop fixture setup' using errcode='55000';
  end if;
  if exists(select 1 from public.nest_ai_conversations where id='4c528a2f-42a3-4e3d-a909-5a0ff7f106da'::uuid) then
    raise exception 'Fixture creation budget already consumed' using errcode='55000';
  end if;
end;
$fixture$;
insert into public.nest_ai_conversations(id,actor_id,household_id,schema_version,revision,transcript)
values ('4c528a2f-42a3-4e3d-a909-5a0ff7f106da'::uuid,'791f7261-6c9d-4061-9c8a-57aa6e0b0200'::uuid,'be772ffd-3ab5-41d5-8438-647a79a553da'::uuid,1,1,'[{"id":"2e844030-b2bd-441c-80ee-df404d097431","role":"user","parts":[{"type":"text","text":"Synthetic corrected handoff-label and maximum-text fixture. No model was called and no household or financial action was performed."}]},{"id":"29500b25-743e-4356-8b67-c1e5a951b926","role":"assistant","parts":[{"type":"tool-openCalendarAgenda","toolCallId":"5130d565-5445-4d78-b63d-115199b1775f","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar"}}},{"type":"tool-openCalendarSettings","toolCallId":"a24b12ab-2a91-40a5-a081-6571c22b2e58","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar-sharing"}}},{"type":"tool-openMealIngredientReview","toolCallId":"3a13e107-6e08-41bb-866f-427e21b7971a","state":"output-available","input":{"weekStart":"2026-10-19"},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"meal-ingredients","householdId":"be772ffd-3ab5-41d5-8438-647a79a553da","weekStart":"2026-10-19","revision":"9"}}},{"type":"tool-openNotificationSetup","toolCallId":"ef92b573-3802-4604-a75c-8a4261fa7a0f","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"notification-preferences"}}},{"type":"tool-openSetup","toolCallId":"f848192a-e068-4b72-a925-6da4320bfa7f","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"setup"}}},{"type":"tool-openAccountSettings","toolCallId":"54ea478d-90a3-469b-8151-ef094816062e","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"settings"}}}]}]'::jsonb)
returning id,actor_id,household_id,schema_version,revision,md5(transcript::text) as transcript_md5;
commit;
