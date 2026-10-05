select 'nest_food_profiles' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.nest_food_profiles t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'nest_food_profile_receipts' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.nest_food_profile_receipts t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'nest_cooking_preferences' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.nest_cooking_preferences t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'nest_cooking_preference_receipts' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.nest_cooking_preference_receipts t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'financial_events' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.financial_events t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'financial_allocations' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.financial_allocations t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'ledger_entries' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.ledger_entries t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'nest_ai_conversations' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.nest_ai_conversations t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'nest_ai_conversation_saves' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.nest_ai_conversation_saves t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'
union all
select 'nest_ai_turns' as table_name,count(*) as row_count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as rows_sha256 from public.nest_ai_turns t where household_id='be772ffd-3ab5-41d5-8438-647a79a553da';
