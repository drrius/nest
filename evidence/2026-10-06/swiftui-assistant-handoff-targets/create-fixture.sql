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
        and id<>'4e809372-f12d-4004-afd3-9a502e98de23'::uuid)
      is distinct from '7284c1c22df502cc7fb70a8b9ff0e903' then
    raise exception 'Original conversations changed; stop fixture setup' using errcode='55000';
  end if;
  if exists(select 1 from public.nest_ai_conversations where id='4e809372-f12d-4004-afd3-9a502e98de23'::uuid) then
    raise exception 'Fixture creation budget already consumed' using errcode='55000';
  end if;
end;
$fixture$;
insert into public.nest_ai_conversations(id,actor_id,household_id,schema_version,revision,transcript)
values ('4e809372-f12d-4004-afd3-9a502e98de23'::uuid,'791f7261-6c9d-4061-9c8a-57aa6e0b0200'::uuid,'be772ffd-3ab5-41d5-8438-647a79a553da'::uuid,1,1,'[{"id":"0ef05ae4-750c-4357-bdba-16340b234f8d","role":"user","parts":[{"type":"text","text":"Synthetic native handoff-link sizing fixture. No model was called and no household or financial action was performed."}]},{"id":"c8799a3d-53fb-4bbc-baea-8e8345b31494","role":"assistant","parts":[{"type":"tool-openCalendarAgenda","toolCallId":"4b98d776-2a14-45c1-82af-fc00b2f555ad","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar"}}},{"type":"tool-openCalendarSettings","toolCallId":"a1d8d6e4-ad35-43ff-8ab0-f0efb22e5a20","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar-sharing"}}},{"type":"tool-openMealIngredientReview","toolCallId":"538cfcaa-4732-440d-8b42-7f14b505ba2d","state":"output-available","input":{"weekStart":"2026-10-19"},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"meal-ingredients","householdId":"be772ffd-3ab5-41d5-8438-647a79a553da","weekStart":"2026-10-19","revision":"9"}}},{"type":"tool-openNotificationSetup","toolCallId":"ad5ea098-00ea-4fde-b610-6abbea7995bc","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"notification-preferences"}}},{"type":"tool-openSetup","toolCallId":"45006827-efe7-40bc-ba40-4ddd6516d935","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"setup"}}},{"type":"tool-openAccountSettings","toolCallId":"00f57634-53c4-4935-a9f7-91f925a22535","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"settings"}}}]}]'::jsonb)
returning id,actor_id,household_id,schema_version,revision,md5(transcript::text) as transcript_md5;
commit;
