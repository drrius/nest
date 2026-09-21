-- Actual legacy expense engine, disposable synthetic data only.
\ir money-ledger-fixture.sql
\ir legacy-money/expense-activity.sql
\ir legacy-money/expense-activity-kinds.sql
\ir legacy-money/expense-receipts.sql
\ir legacy-money/expense-validation.sql
\ir legacy-money/expense-retry.sql
\ir legacy-routine-edits/notice-tables.sql
\ir legacy-routine-edits/notice-functions.sql
\ir legacy-routine-edits/notice-delivery.sql
\ir legacy-money/expense-post.sql
\ir legacy-money/expense-command.sql
-- Fixture permissions reproduce the relevant legacy public/private boundary.
alter table public.activity_events enable row level security;
alter table public.money_command_receipts enable row level security;
alter table public.inbox_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
revoke all on function public.post_manual_expense(uuid,text,bigint,uuid,jsonb,date,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.post_manual_expense(uuid,text,bigint,uuid,jsonb,date,text,uuid,text,text) to authenticated;
grant select on public.money_command_receipts to authenticated;
