# Saved meals and recipe snapshot audit

Pinned reference: Household OS commit `4a528c96caf41515a70291ccecbba9d7b35e3349`. Read-only source inspection; no production data was accessed.

## Audited storage and behavior

- `20260811180000_meals_groceries.sql:15–42` defines household-owned meal definitions and ordered grocery templates. Definitions contain name, optional recipe URL and notes, archive time and timestamps. Ingredients retain separate name, quantity text, unit text, optional category, note and order. Composite household foreign keys prevent cross-household definition/category references. Quantity/unit text must not be silently parsed or combined.
- The same migration's definition/template RLS and grants at lines 1785–1814 and 1874–1881 permit both current household members to read, insert and update the agreed columns. The old template delete grant is superseded by `20260904231923_meal_library_lifecycle_and_preparation.sql:2–5`, which adds archive state and removes authenticated deletion. Fixture extraction must use the final policy/grant state, not the original deletion permission.
- `20260905075117_meal_template_edit_versions.sql` adds template timestamps and guarantees a strictly advancing microsecond edit version. A definition timestamp alone cannot identify the whole recipe: ingredient edits do not update it. Native recipe selection and editing must include ingredients in their revision identity.
- `save_planned_meal_to_library` in the lifecycle migration validates HTTP(S) links and creates a definition from name/link/notes. It marks slotted entries as grocery-materialized without adding ingredients. Do not reuse that side effect: Nest requires separate explicit ingredient review and durable approval.
- Legacy placement snapshots title and recipe URL, but there are no structured servings, cooking instructions or ingredient snapshot columns. Notes must remain notes. Do not label old notes as verified cooking instructions, invent historical servings, or claim that today's library ingredients were the ingredients in an old planned meal.
- Legacy grocery materialization reads currently active library templates, creates groceries immediately, and sets an entry marker. That implementation is not suitable for Nest's explicit ingredient review or immutable planned recipes.

## Native implementation decisions

Keep existing definition and ingredient identities and history. Add recipe metadata without guessing values for existing rows: unknown legacy servings/instructions remain explicitly unknown. New native saved recipes need servings, ordered ingredients and short cooking instructions, with an optional safe HTTP(S) source link. Do not import web pages automatically or introduce nutrition/macro tracking.

Use a monotonic household library revision advanced by definition and ingredient mutations, including legacy writes, so a selection cannot mix a newer ingredient list with an older definition. Bounded paginated summaries and an authorized recipe detail read must expose exact revision information. Pagination must detect library changes rather than silently drop or repeat changed entries. Recipe edit/archive commands need explicit baselines and actor-private immutable receipts; authorization is checked before replay.

When a saved recipe is placed or used as a replacement, atomically snapshot its complete authorized contents at the requested library revision. Later recipe edits/archive must not rewrite planned meal snapshots. Existing meal/week baselines still protect occupied slots and concurrent household edits. Saving a recipe or placing it never creates groceries. Separate ingredient review operates on the visible planned snapshot and exact approval identity, preserving quantity/unit distinctions and allowing pantry exclusions.

Native detail screens and the private AI read/tool surface must use the same validated authorized recipe contracts. An old planned meal without an ingredient snapshot must say that historical recipe details are unavailable; a separately labeled link may open the current library recipe. Offline recipe detail is limited to the explicitly retained planned snapshots, without creating a new offline editing queue.

## Required verification

Prove recipe/ingredient RLS and composite household constraints using the audited final table shapes; reject foreign categories/definitions and revoked receipt replay. Exercise revision changes from both native and legacy definition/template edits, stable pagination, selection racing archive or ingredient edits, and snapshot immutability after later library changes. Verify full rollback of recipe writes, planned entry snapshots, revision counters and receipts. Test approved ingredients separately for exact quantities/units, pantry exclusions and duplicate/lost-response approvals. Recipe detail, selection, native editing, AI actions and phone accessibility remain unimplemented until their actual flows are verified.

## Read storage boundary

The first additive migration stores optional recipe servings as a positive PostgreSQL int32 count and short instructions as at most 4,000 Unicode code points. Existing rows retain null metadata; personal portion multipliers are a separate preference. No recipe data is backfilled or inferred. Source links are returned as stored data, including unsafe legacy schemes; the later native opener must allow only HTTP(S).

Read pages contain at most 50 active definitions ordered by UUID, with an exact household revision required on continuation. Recipe detail requires that revision and returns at most 200 active ingredients ordered by stored order then UUID; larger historical recipes fail explicitly without partial content. These transport bounds do not delete or rewrite historical rows. All read functions are stable security invokers, so the revision, definition and ingredient queries share the caller's MVCC snapshot. Revision triggers are private, trigger-only definers that cannot be called by clients; updates, archives and administrative deletes all advance the counter atomically. Native save/select commands and immutable planned recipe snapshots are still separate pending work.

The fixture uses the existing audited definition/template table extraction from `legacy-meals/tables.sql`. `legacy-meals/library-policy.sql` adds the final read/insert/column-update policies, archive column and final template version trigger from the migrations cited above. No obsolete delete grant, publication change or legacy UI is imported.

## Native creation command

Creating an explicitly requested saved recipe is an ordinary authorized household action, separate from generated-week and ingredient approvals. The shared draft contains a title, positive base servings, short instructions, optional notes/source, and 1–200 ordered ingredients. Quantity and unit text remain distinct and duplicate ingredient names are not combined. New strings use the native UTF-16 limits; existing stored reads retain the legacy Unicode-code-point limits. Source syntax requires an explicit HTTP(S) authority without credentials, whitespace, backslashes or control characters. Links are never fetched or followed by the command; the native opener separately validates parsability.

Creation locks current membership, the actor/household/operation identity and the exact whole-library baseline before inserting anything. It checks referenced active categories under shared locks, creates server-owned definition/ingredient identities, and stores an actor-private immutable receipt. One definition plus each ingredient advances the library revision; input validation reserves all increments within int64. Recipe data, counters and the receipt share a transaction. Receipt recovery checks current membership before replay and survives later partner edits/archive without recreating the recipe. No plan, grocery or financial command is called.
