-- GATED additive candidate; no production application. Existing library snapshots retain their shape.
-- Null provenance means a complete one-off recipe, never a hidden/archived library definition.
alter table public.nest_planned_recipe_snapshots alter column library_revision drop not null;
alter table public.nest_planned_recipe_snapshots add constraint nest_recipe_snapshot_provenance check (
  ((library_revision is null and recipe->'definitionId'='null'::jsonb)
   or (library_revision is not null and jsonb_typeof(recipe->'definitionId')='string')) is true
);
-- Existing member-only reads, immutable meal content guard and copy-on-leftover behavior apply.
-- No new write privilege or public insertion endpoint is introduced. Proposal approval will be
-- the authorized writer; until implemented, one-off snapshots are exercised only in safe fixtures.
