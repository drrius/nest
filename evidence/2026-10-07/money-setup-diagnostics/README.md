# Money setup failure and request diagnostics

The owner's 7 October TestFlight screenshots show balance and Add expense failing.
Read-only queries of nest-test confirm the owner's household has one linked member;
the simulator household has two. Calling nest_money_balance under the owner's
existing authenticated membership, in a read-only transaction, fails with SQLSTATE
22023, "Money requires two household members". No identity or financial data was
changed. The expense form reads the same balance before presenting people/splits.

The API previously collapsed this condition into unavailable/503. A focused
regression failed before the change and passes after it: the exact balance RPC
error becomes household_incomplete/409. Other 22023 errors, including ledger
integrity failures, remain unavailable. Native handling explains that the partner's
verified account must be linked. The two-member financial invariant stays intact.
The partner's actual account verification/linking remains outstanding.

Client diagnostics generate a request UUID/W3C traceparent and record build/version,
allowlisted route category, status, elapsed time and fixed error category. A 128-record
memory buffer can be shared from Profile > Diagnostics. iOS OSLog receives the same
sanitized fields. No bodies, tokens, account IDs, URLs/queries, calendar details,
private chat, expense descriptions or financial amounts are retained.

The API uses actual OpenTelemetry server/client spans and emits sanitized JSON to
existing Vercel runtime logs. Request IDs and trace IDs correlate native reports to
Auth, membership and Supabase RPC transport/decode/schema/response stages. Streaming
completion/disconnection is recorded once and backpressure is preserved. No paid
collector or external drain is configured; these are OTel span-derived console logs,
not a hosted trace dashboard. AI provider/tool spans and receipt Edge diagnostics
are not covered by this initial change.

Verification: focused API tests pass11; six diagnostic Foundation tests pass on
the authorized Mac. Signed native app compilation and two focused simulator MoneyAccountTests pass
with zero failures or skips. [Verification counts](verification.json). The initial
local packaging attempt missed two resource files and failed before execution;
including those unchanged inputs allowed the checks to run. Deployment is pending. These edits are not in TestFlight build24.
