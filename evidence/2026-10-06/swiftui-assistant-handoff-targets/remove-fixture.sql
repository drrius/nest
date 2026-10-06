-- Delete only the unchanged, childless synthetic fixture; preserve all original rows.
begin;
set local lock_timeout='5s';
set local statement_timeout='10s';
with removed as (
  delete from public.nest_ai_conversations c
  where c.id='4e809372-f12d-4004-afd3-9a502e98de23'::uuid and c.actor_id='791f7261-6c9d-4061-9c8a-57aa6e0b0200'::uuid
    and c.household_id='be772ffd-3ab5-41d5-8438-647a79a553da'::uuid and c.schema_version=1 and c.revision=1
    and c.transcript='[{"id":"0ef05ae4-750c-4357-bdba-16340b234f8d","role":"user","parts":[{"type":"text","text":"Synthetic native handoff-link sizing fixture. No model was called and no household or financial action was performed."}]},{"id":"c8799a3d-53fb-4bbc-baea-8e8345b31494","role":"assistant","parts":[{"type":"tool-openCalendarAgenda","toolCallId":"4b98d776-2a14-45c1-82af-fc00b2f555ad","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar"}}},{"type":"tool-openCalendarSettings","toolCallId":"a1d8d6e4-ad35-43ff-8ab0-f0efb22e5a20","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"calendar-sharing"}}},{"type":"tool-openMealIngredientReview","toolCallId":"538cfcaa-4732-440d-8b42-7f14b505ba2d","state":"output-available","input":{"weekStart":"2026-10-19"},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"meal-ingredients","householdId":"be772ffd-3ab5-41d5-8438-647a79a553da","weekStart":"2026-10-19","revision":"9"}}},{"type":"tool-openNotificationSetup","toolCallId":"ad5ea098-00ea-4fde-b610-6abbea7995bc","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"notification-preferences"}}},{"type":"tool-openSetup","toolCallId":"45006827-efe7-40bc-ba40-4ddd6516d935","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"setup"}}},{"type":"tool-openAccountSettings","toolCallId":"00f57634-53c4-4935-a9f7-91f925a22535","state":"output-available","input":{},"output":{"ok":true,"value":{"kind":"device_handoff","screen":"settings"}}}]}]'::jsonb
    and not exists(select 1 from public.nest_ai_turns t where t.conversation_id=c.id)
    and not exists(select 1 from public.nest_ai_conversation_saves s where s.conversation_id=c.id)
  returning id
) select count(*)::integer as removed_fixture_rows from removed;
commit;
