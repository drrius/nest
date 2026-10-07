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
