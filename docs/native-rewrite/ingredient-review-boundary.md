# Separate ingredient review

The approved brief requires an optional ingredient review after meal approval, pantry exclusions, retained quantities/units and idempotent addition. Checking groceries must never create an expense. This boundary also applies to manually planned recipe meals; missing historical recipe details remain unknown.

## Reference audit

Read-only legacy reference: `household-os` commit `4a528c96caf41515a70291ccecbba9d7b35e3349`, `supabase/migrations/20260811180000_meals_groceries.sql`.

`private.materialize_meal_groceries` locks a meal and copies every current library template into grocery rows, retaining separate quantity/unit, note and originating meal ID. It skips ideas, leftovers and a previously materialized meal. The legacy placement/move commands can invoke that function automatically. Its whole-meal marker prevents another materialization but cannot represent selected pantry exclusions or separate partial selections. It reads current library templates rather than Nest's retained planned recipe snapshot.

Do not reuse that function or the automatic calls. Reuse only the deliberately inspected concepts of separate quantity/unit and retained meal provenance. No legacy implementation code or production data has been copied by this audit.

## Native implementation boundary

- Review uses the authorized saved week and its exact revision, and retained planned-recipe ingredients. Proposed/unapproved meals are not shopping sources. Current library edits cannot silently replace reviewed ingredients. Leftovers do not request another purchase of their source meal's ingredients.
- Keep each ingredient's meal-entry and retained ingredient identity. Do not deduplicate by normalized names, sum quantities, convert units or combine different sources automatically. Grocery display names follow the existing outer-space trimming rule; retained meal snapshots remain exact. Unknown quantity remains null. Pantry exclusions are explicit selection state, preserved through refresh/navigation and uncertain writes; no regeneration can reintroduce them silently.
- Bound and paginate reads so a week with the maximum retained ingredients cannot produce an unbounded API response. Make incomplete loading visible before confirmation. The user confirms the selected ingredients separately from meal approval.
- The authorized add command carries the exact baseline and selected source identities with reviewed quantities/units. Derive names and provenance from authorized retained snapshots. An archived same-household category becomes uncategorized, with original category retained in the meal snapshot; a foreign/missing category is rejected. reject stale/foreign/deleted sources atomically. Do not trust client-supplied source recipe content.
- Persist the original operation and selection before dispatch. Historical replay must return its original receipt after later grocery edits/checks/removal, while current membership remains mandatory. Source identity deduplication must also protect concurrent household additions; it must never overwrite a partner's subsequent grocery edits.
- Validate legacy Unicode and metadata limits deliberately. Never truncate an ingredient or silently coerce incompatible quantities/units. Grocery text limits must count Unicode code points like PostgreSQL and retained recipe codecs, including on ordinary edits of newly added items.
- Retain source meal provenance in the checklist without making it dominate each row. Addition creates no shopping session, price, financial obligation or payment. Expose a matching authorized assistant action or an honest native ingredient-review handoff; never substitute ordinary addGrocery calls for a generated-plan ingredient approval.

Contracts, pure selection reconciliation and gated storage are locally implemented. Read pages contain at most 100 rows; a confirmation can include at most 4,200 distinct sources (21 slots × 200 retained ingredients). The bounded writer accepts up to 8 MiB of JSONB input and builds its canonical selection and receipt with aggregates rather than repeated array concatenation. An authenticated HTTP adapter must preserve those bounds instead of applying the ordinary small command limit.

Source deduplication is household-wide and permanent for that retained meal/ingredient identity, including after the original grocery is checked or removed. A later need can be added manually through the ordinary checklist; replay cannot resurrect removed groceries. Conflicting concurrent quantities retain the first committed row and return `already_added` to the other caller. Refresh never overwrites an existing pantry exclusion or text edit and never automatically selects a newly appearing source. UI must make selection explicit.

This remains an incomplete vertical slice. API, native selection/recovery/confirmation, checklist provenance and assistant handoff remain to be built. Physical-device acceptance remains separate.
