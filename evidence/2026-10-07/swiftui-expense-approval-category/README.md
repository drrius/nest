# Expense approval category review

SwiftUI expense approval now reads its proposed category through the existing
authenticated, tenant-scoped single-category API. Active and archived category
names are displayed. Missing or failed metadata reads keep Decline available and
disable Approve, including its decision guard. Refresh retries the metadata read.
Saved decisions retain their recovery controls; category failure does not undo or
change a previously recorded decision.

Five focused Mac Foundation tests pass without skips, including three new native
API tests for bearer/household headers, exact category identity, archived names,
foreign household or substituted category rejection, and an honest missing result.
The injected transport tests verify native contract behavior, not hosted execution.
Signed simulator build-for-testing passes. No UI method was executed in this pass.

Two existing disposable Postgres/PostgREST integration cases pass without skips:
SDK proposal response-loss recovery/privacy and exact category review followed by
explicit confirmation. These use test-only protocol adapters and synthetic tool
invocations. They do not prove native approval interaction or live model access.
The initial `pnpm exec tsx` invocation failed before execution because tsx is not
installed; the repository's `node --test` command completed both cases.

Strict Swift formatting, source limits, full repository formatting and diff checks
pass. Current-change CI remains pending until the feature branch is pushed. The
shipping change is not in TestFlight build19. Hosted fixtures, retained financial
history, production and distribution were not changed.

The same bounded change is applied to correction approvals that replace an
expense. Opening-balance and reversal-only proposals need no category lookup.
Missing replacement category metadata disables only approval; decline and saved
decision recovery remain available. The correction decision guard also refuses
approval without the required category name. Its existing exact bound-receipt
Foundation test passes, and the signed simulator build-for-testing passes again.
This adds no rendered native correction-approval or live-provider evidence.

## Native pending expense review

One fresh fictional Alex-owned proposal is created through the audited private
`nest_propose_expense` command with fixture auth claims, not an arbitrary approval
insert. This privileged fixture setup is not authentication or model evidence.
It proposes CHF1.01, Alex payer, 51/50-centime shares and the existing Home category.
No receipt, bank payment or actual expense is involved. The new approval audit row
is retained; existing proposals and receipts are unchanged.

The actual normal-size SE3 native method passes once without skips. It verifies
Alex identity, opens the one eligible expense proposal from Money, reads its
description and Home category, verifies the enabled44pt Approve target, opens the
decline confirmation and chooses Cancel, then returns to Today. The signed product
was built from the shipping category fixes plus the retained guarded UI test.
No Record or Decline confirmation is tapped. A privileged read afterward confirms
pending status with null decision/consumption timestamps. Eight retained fixture
fingerprints, including62 financial events/104 allocations/124 ledger rows, remain
exact. Both original simulator scopes,64 empty journals, settings and device-only
calendar/first-use selections are restored by the controller.

The screenshot is directly inspected. Native metadata failure/retry, actual
decline/approve posting, maximum text, partner privacy and correction review still
need their own execution. Live model generation and phone acceptance remain open.
