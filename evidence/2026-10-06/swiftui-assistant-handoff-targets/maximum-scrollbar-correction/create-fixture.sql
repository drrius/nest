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
        and id<>'10b77a97-1709-4799-9b17-8cb3a613d402'::uuid)
      is distinct from '7284c1c22df502cc7fb70a8b9ff0e903' then
    raise exception 'Original conversations changed; stop fixture setup' using errcode='55000';
  end if;
  if exists(select 1 from public.nest_ai_conversations where id='10b77a97-1709-4799-9b17-8cb3a613d402'::uuid) then
    raise exception 'Fixture creation budget already consumed' using errcode='55000';
  end if;
end;
$fixture$;
insert into public.nest_ai_conversations(id,actor_id,household_id,schema_version,revision,transcript)
values ('10b77a97-1709-4799-9b17-8cb3a613d402'::uuid,'791f7261-6c9d-4061-9c8a-57aa6e0b0200'::uuid,'be772ffd-3ab5-41d5-8438-647a79a553da'::uuid,1,1,'[{"id":"aa35fd27-2f2a-43a2-906b-f8a12aa97b31","role":"user","parts":[{"type":"text","text":"Synthetic maximum-text conversation scroll-gesture fixture. No model was called and no household or financial action was performed."}]},{"id":"aa22444a-0fbb-43fe-b12e-6f33c1500aad","role":"assistant","parts":[{"type":"tool-openCalendarAgenda","toolCallId":"9b19e6c3-02f3-4a2e-8f8f-f7a5a097c68f","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar"}}},{"type":"tool-openCalendarSettings","toolCallId":"52be13e7-b2bf-4289-9a38-581bfb867236","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar-sharing"}}},{"type":"tool-openMealIngredientReview","toolCallId":"29799db7-581b-47a8-bae8-09f3cdbce8a0","state":"output-available","input":{"weekStart":"2026-10-19"},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"meal-ingredients","householdId":"be772ffd-3ab5-41d5-8438-647a79a553da","weekStart":"2026-10-19","revision":"9"}}},{"type":"tool-openNotificationSetup","toolCallId":"10ec0c29-1884-42cf-bae5-21e284ee08c9","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"notification-preferences"}}},{"type":"tool-openSetup","toolCallId":"b25ec51e-2f54-47ac-af6a-3512d1e9adc6","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"setup"}}},{"type":"tool-openAccountSettings","toolCallId":"bfe12dc8-8f8c-418d-bd82-4b90e170f9ee","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"settings"}}}]}]'::jsonb)
returning id,actor_id,household_id,schema_version,revision,md5(transcript::text) as transcript_md5;
commit;
