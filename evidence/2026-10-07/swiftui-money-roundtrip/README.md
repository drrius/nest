# Native settlement and expense round trip

Source `a7e6b8cd` passes one guarded real native SE3 method in 70.1 seconds, zero
skips. The signed app uses the stable nest-test API/Supabase origins, existing
fictional Test Alex membership and an exclusive two-operation budget. The method
records a full 1-centime payment from Test Sam to Test Alex, observes the canonical
recorded result and settled balance, finishes the saved request, then records a
2-centime equal expense paid by Test Alex. It observes the canonical expense result,
finishes that request and returns to Today. Both result screenshots are inspected. Their status nodes exist but lie below
the initial viewport; this reveals a feedback-placement gap rather than proving
that the initial confirmation is visibly clear.

The hosted read confirms exactly two new events: settlement 48bd1522-8ee3-42fb-9a9a-c3ed74889e1a and expense is
df4b9d97-e8b4-499d-8bac-4d335a803341. The 1-centime settlement adds −1/+1 ledger
entries; the 2-centime expense adds +1/−1 and exactly 1/1 allocations. Each event has
two zero-sum ledger rows. Final balances match the original +1/−1 centime.

All 62 original events, 104 allocations and 124 ledger rows retain exact hashes.
The fixture now intentionally retains 64 events, 106 allocations and 128 ledger rows.
These new fictional records are append-only, not deleted or reversed to hide the
test. The current fingerprint baseline is recorded separately from retained-row
proof. Other protected household/grocery/meal rows stay unchanged.

The posting budget is consumed and the method must not be rerun with these same
fixture assumptions. The exclusive invocation file is retained on the Mac. Both
original scopes, 64 empty journals, settings and local privacy/first-use choices
restore. No production data, provider/worker, receipt upload or bank transfer is
involved. The earlier read-only inventory query used the wrong ledger-column name;
correcting it to the audited receivable_delta_cents yields the exact baseline before
any native action.

This is actual UI → authorized test API → database → native result evidence for
the ordinary happy path. It does not establish physical-phone use, live AI approval,
financial network loss/restart/conflicts, scheduled posting or full M7 acceptance.
Current-source CI remains pending. No new TestFlight submission occurs.
