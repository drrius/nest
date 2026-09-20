# Accepted chore handovers

The approved M4 handover applies to one current assigned occurrence. Its responsible member asks the other current household member to take it; only that recipient may accept or decline. Requesting alone never changes responsibility. Shared chores retain ordinary shared completion and editing, without a transfer gate.

## Audited recurrence boundary

Reference: Household OS `4a528c96caf41515a70291ccecbba9d7b35e3349`, the closure function already audited in [routine-closure-audit.md](routine-closure-audit.md), and the actual recurrence/edit fixtures in this repository. The closure engine calculates future alternating turns from `planned_assignee_id`. Replacing that value on acceptance would incorrectly alter later turns.

The additive candidate therefore stores `nest_accepted_assignee_id` separately. Native reads must use `coalesce(nest_accepted_assignee_id, planned_assignee_id)` as effective responsibility, while recurrence continues using the planned identity. New successors have no override. Completing an accepted turn retains the actual completer. Rescheduling that same turn preserves accepted responsibility; replacing its planned identity clears the override. General routine definition edits retain ordinary household authorization.

A monotonically incremented occurrence assignment revision invalidates requests when due date, owner, status, role or target identity changes, including changes away and back. Acceptance locks the exact occurrence and active/unpaused routine and checks the saved baseline. Rebuild deletion cannot redirect consent to a successor. A partial unique index permits one pending request per target; repeated requests converge and stale requests become superseded when replaced. The list returns only applicable pending requests.

## Authorization and retries

Internal privileged helpers are private and not executable by clients. Public invoker wrappers call a narrowly granted private command which checks current membership and locks both members before a new write. Membership removal or identity replacement permanently supersedes pending requests, so rejoining cannot revive earlier consent. Only the effective owner can request; only the named recipient can respond. RLS permits current household members to read requests and only the original actor to read operation receipts. Direct client assignment/request/receipt writes are denied.

Actor/household/operation receipts retain the exact input hash and immutable result. Authorized retries replay before target lookup, including after acceptance or a rebuild. Request/acceptance and the receipt commit atomically. Occurrence then routine lock ordering matches the native closure/edit boundary; unavailable routine locks become conflicts, not silent retries. This command creates no offline outbox entry or financial approval.

## Evidence and remaining integration

Disposable actual-engine database tests exercise recipient consent, shared/foreign/anonymous denial, duplicate requests, accept/decline races, stale requests, date/assignment ABA changes, revocation, receipt failure rollback, and daily/after-completion alternating succession. Twelve additional races cover acceptance against completion, rescheduling and definition rebuild. Strict Effect contract tests reject incorrect consenting actors, hidden scope, action/state mismatches and malformed dates/identities. Security advisors run against the disposable fixture only.

Storage/contracts are a reviewable foundation, not a completed handover flow. The API candidate supplies effective-owner mapping and authenticated pending/request/respond endpoints with strict receipt binding. Native request/inbox controls, recovery and corresponding private AI actions must land before this workflow is counted implemented. Item notifications and physical device acceptance remain separate M8/M4 work. Legacy notification semantics are unchanged. No production migration has been applied; legacy writer cutover and a full authorized migration rehearsal remain M9 gates.
