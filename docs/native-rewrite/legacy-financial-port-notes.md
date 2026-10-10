# Remaining SwiftUI legacy financial slices

Audited3 October2026 while direct dismissal source `8ddb0e35` passed native/routine CI and private dismissal source `1560e9ec` subsequently passed Foundation/signed-native/routine CI. These notes guide implementation; they do not close M7/M9 or authorize production changes.

## Draft confirmation

Reuse `LegacyDraftContext`, exact CHF `Centimes`, the current two-member expense rules and authorized MoneyAPI transport. Port the form and journal deliberately; do not copy the historical UI/runtime wholesale.

A pending, recurring-origin, unlinked draft is retained context, not a debt or payment. Display original terms separately from the **new expense** the member explicitly chooses. `LegacyConfirmInput` binds draft ID, original rule ID and the opaque raw token to the complete new expense. Its receipt must retain the exact original context, selected expense, actor/household/operation, approval identity and actual posted event. Receipt paths and separate receipt totals are forbidden by this conversion contract. Current members and allocations need fresh validation; old removed members cannot become current allocations by inference.

Direct and private paths need fresh online staging, exact SQLite intent before dispatch, receipt-first explicit retries, durable cancellation/withdrawal, immutable results and account isolation. Loading/foregrounding must never post. A returned PT412 proves that request failed transactionally, but a generic client conflict or changed raw fingerprint cannot discard an uncertain earlier command. Explicit cancellation can fence a direct pending operation; a private consumed/denied outcome can finish a saved private decision. Never rebase an uncertain saved operation to new terms.

## Rule adoption

Port `LegacyAdoptionContext` with its exact rule history/counts, raw token, coverage boundary, unique blocker set and optional prior adoption. Blockers include pending drafts, unreconciled entry/status links, unsupported coverage dates, native identity collision and prior adoption. No unsupported coverage boundary may be replaced with an invented date.

The editor must explicitly choose and review a **new mandate**: fixed automatic versus variable confirmation, amount, payer, split, cadence, start and first uncovered cycle. The old active flag grants no consent. Server Zurich day and retained coverage must be rechecked before staging; server SQL requires prospective start and an exact first uncovered cycle. Successful adoption retains identifiers/history and deactivates the old generator transactionally. Reading a clear blocker list does not grant a mandate; worker activation remains separately gated.

The private proposal binds old source plus the exact new configuration and first cycle. Raw fingerprints may revert here too. Preserve uncertain consent until the exact server outcome or explicit serialized withdrawal is known. Do not copy irreversible native-cycle retirement logic into reversible raw legacy context.

## Reuse evidence and next verification

Seven named HTTP/PostgREST/isolated PostgreSQL cases passed without failures/skips: four direct confirmation/receipt/authorization cases, one transactional changed-context confirmation conflict/zero-sum case and two adoption-context/blocker/tenant cases. Actual TAP: `/tmp/nest-legacy-next-contract-audit.tap`. Command: `NEST_TEST_PG_BIN=/tmp/nest-postgres/usr/bin NEST_TEST_POSTGREST_BIN=/tmp/nest-postgrest/postgrest node --test --test-concurrency=1 --test-reporter=tap tests/integration/legacy-confirmation.test.mjs tests/integration/legacy-confirmation-conflict.test.mjs tests/integration/legacy-adoption-context.test.mjs`.

These prove audited existing server boundaries, not SwiftUI forms, actual taps, live AI or phone acceptance. Add cross-language goldens and meaningful Core/SQLite/signed-native cases for each client slice, including membership changes, lost replies, changed/reverted raw content, approval expiry/withdrawal, no automatic replay and immutable ledger/mandate relationships. Safe populated nest-test fixtures and both phones remain necessary before final acceptance. Production reconciliation and external-writer/cutover gates remain separate.

Adoption port re-audit on3 October: six named existing context/form/conflict cases pass with zero failures/skips (`/tmp/nest-swiftui-adoption-port-audit.tap`). Adding two new native-wire fixture cases gives eight actual named cases passing with zero failures/skips (`/tmp/nest-adoption-wire-port.tap`). These verify explicit fixed/variable future mandates, retained coverage and stale-source/cycle conflicts without posting; they do not establish SwiftUI execution or hosted acceptance.
