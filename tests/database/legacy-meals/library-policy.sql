-- Audited final library table permissions from household-os 4a528c9; see meal-library-audit.md.
alter table public.meal_definitions enable row level security;
alter table public.meal_grocery_templates enable row level security;
create policy "members can read meal definitions"
on public.meal_definitions for select to authenticated
using ((select private.is_household_member(household_id)));

create policy "members can create meal definitions"
on public.meal_definitions for insert to authenticated
with check ((select private.is_household_member(household_id)));

create policy "members can update meal definitions"
on public.meal_definitions for update to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

create policy "members can read meal grocery templates"
on public.meal_grocery_templates for select to authenticated
using ((select private.is_household_member(household_id)));

create policy "members can create meal grocery templates"
on public.meal_grocery_templates for insert to authenticated
with check ((select private.is_household_member(household_id)));

create policy "members can update meal grocery templates"
on public.meal_grocery_templates for update to authenticated
using ((select private.is_household_member(household_id)))
with check ((select private.is_household_member(household_id)));

revoke all on public.meal_definitions,public.meal_grocery_templates from public,anon,authenticated;
grant select,insert on public.meal_definitions,public.meal_grocery_templates to authenticated;
grant update(name,recipe_url,notes,archived_at) on public.meal_definitions to authenticated;
alter table public.meal_grocery_templates add column archived_at timestamptz;
grant update(name,quantity,unit,grocery_category_id,note,sort_order,archived_at)
  on public.meal_grocery_templates to authenticated;
-- A stable initial default avoids rewriting existing rows on PostgreSQL 17.
alter table public.meal_grocery_templates
  add column updated_at timestamptz not null default transaction_timestamp();
alter table public.meal_grocery_templates
  alter column updated_at set default clock_timestamp();

create function private.advance_meal_template_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function private.advance_meal_template_version() from public, anon, authenticated;
create trigger advance_meal_template_version before update on public.meal_grocery_templates
for each row execute function private.advance_meal_template_version();
