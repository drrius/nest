# Renewal implementation audit

## Confirmed scope

The product brief and M8 require title, renewal date, cancellation lead time, optional responsible member and optional recurring-expense link. Create/update/remove are shared authorized online commands with corresponding AI actions. Date changes do not affect the ledger. Reminders are separately configured; recipient preferences win. Renewal layers in Calendar remain app-only.

## Audited legacy source

`household-os/supabase/migrations/20260904225405_connected_household.sql`, lines 114–151, defines `household_commitments`. Its identity is household-scoped. Responsibility and recurring-rule links use composite household foreign keys. It stores renewal date and notice days (0–730), plus provider, status, expected cost, billing interval, contact, website, notes and archival metadata. The legacy UI permits an absent renewal date. Legacy statuses include `cancel_requested`; this is recorded status, not evidence that a cancellation was actually performed.

The source grants direct authenticated insert/update behind membership RLS. That is insufficient for Nest's exact-operation recovery and stale-edit protection; do not copy these write permissions into a new native command boundary. The entire connected-household migration also creates excluded project/contact/inventory infrastructure and must not be imported merely to obtain renewals.

`20260905082952_home_review_guards.sql` derives cancellation attention from `renewal_on - notice_days`, rather than the renewal date itself. Reuse that civil-date meaning, not the broader legacy attention dashboard. Existing pure civil-date helpers in Nest can support deadline calculations without time-zone-dependent local Date arithmetic.

## Preservation and acceptance requirements

- Audit migration mappings against fixtures before touching existing data. Preserve raw legacy fields and identities, including fields outside the new editing surface; do not silently reinterpret absent dates or cancellation status.
- A renewal is not a financial mandate. Creating/removing it, changing its deadline or linking an expense must never post money, approve a recurring configuration, transfer payment or cancel a service.
- Validate responsibility and linked-rule household ownership in storage, including membership/rule changes racing a save. Retained legacy recurring references must remain distinguishable from native adopted configurations during migration.
- Use immutable operation receipts and expected revisions for online create/update/remove recovery. No offline renewal write queue.
- Test date boundaries, zero/nonzero lead times, tenant isolation, stale edits, concurrent retries and the absence of financial side effects. Item revisions must later invalidate obsolete reminders.
- Keep notification enrollment/delivery separate. Until the scheduler/outbox and physical-device acceptance pass, do not label a reminder as delivered or scheduled successfully.

This audit establishes source facts and constraints. Renewal storage, API, UI, AI actions and reminder delivery remain unimplemented.
