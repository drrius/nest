# Native grocery checking

The authenticated Today screen links to `/checklist`. Native checkbox controls load real authorized groceries through the API; quantities/units are displayed, pending operations survive SQLite restart and conflicts require explicit discard before a fresh action. Compatible check/uncheck chains retain original operation UUIDs and predecessor receipt versions. Confirmed auth loss blocks checking; later availability failures do not clear that denial. The root account store is shared with chores, and each snapshot replaces only its own feature data.

Eleven local transport/controller/SQLite tests plus a real HTTP/PostgREST/PostgreSQL restart journey pass. The latter includes a lost committed response, partner convergence, concurrent description conflict and membership revocation. Node SQLite and synthetic Auth remain fixture boundaries, not an iPhone test.

Online add/edit/remove, retained retries, automatic reconnect and cold-start offline identity are implemented. Bounded local journal retention is merged. Category labels and optional grouping are implemented with review pending; physical-device verification remains outstanding. No purchase or expense is created by checking; receipt/expense entry remains a separate future Money action. This screen is not the completed groceries milestone.

## Prepared device smoke (not executed)

On two test iPhones connected to the isolated backend, load the same checklist. Check offline, uncheck again, kill/reopen after approved offline identity recovery is available, then reconnect. Verify final state and one receipt per operation. Drop an acknowledgment after commit; confirm exact retry. Let the partner check the same item and edit another item's description; verify compatible convergence versus a visible conflict. Move repeatedly between Today and groceries while replay is active; verify neither invalidates the other's lease. Confirm logout/account change hides the prior household and preserves its pending work for the same identity. Verify haptics, VoiceOver, large text, dark mode and Reduce Motion on the actual build.

Online add/edit/remove use a separate retained attempt, never the automatic offline journal. The native editor persists the exact shared command before dispatch, validates the scoped receipt and clears only the matching operation after success. An uncertain attempt remains read-only until explicit retry or informed discard; restarting or refreshing never sends it. Category reads are bounded and scoped. Checklists refresh on focus after returning from an editor. Native text input, dismissal guards and accessibility still require device execution.

## Category presentation

`groceryReads.list` uses the authenticated `nest_grocery_snapshot` JSON aggregate. The database checks current household membership and joins category and source-meal rows using both household and record IDs in one statement snapshot. PostgREST’s result-row cap does not truncate the aggregate. The relationship was verified against legacy migration `20260811180000_meals_groceries.sql` at pinned commit `4a528c96caf41515a70291ccecbba9d7b35e3349`; no legacy code or data was copied. The API checks nested household/category identities and only projects active labels. `categoryName` is an optional additive read field, so older cached groceries remain readable. Both native and AI reads use this shared service.

The checklist starts as a simple list with category labels; its grouping button changes presentation only. Group order follows first visible appearance, items retain their canonical relative order, and category IDs distinguish identically named groups. Uncategorized, archived or unavailable labels fall under “Other groceries.” Filtering occurs before grouping, so no empty headers remain and pending/conflicted checked items stay visible. Controls, header navigation with VoiceOver and large-text scrolling still require an iPhone.

## Meal provenance and complete snapshots

The additive `mealSource` field contains only the retained source entry ID, title, date and slot. The native row shows these as provenance, without implying that the meal is still scheduled or that an already checked item needs buying again. Foreign or missing sources produce no label; the API separately validates nested household identity. Older SQLite records without the optional field remain readable.

API, native client and cache no longer refuse lists over 500 items. A real 4,200-ingredient addition is verified through the native grocery client, SQLite restart and an offline check followed by reconciliation. The grocery check journal retains its existing bounded queue and per-sync replay policy. No purchase history is flattened, no expense is created, and production migration remains separately gated.
