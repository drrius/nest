# Denied planned recipe and preparation read copies

Both baseline regressions fail. A forbidden planned-recipe reply leaves its
cached detail visible and available after offline restart; an older held detail
reply becomes fresh after Today receives a forbidden week reply.
[Baseline failures](baseline-summary.json).

Planned-recipe reads now carry the existing scoped meal-week ticket from before
loading. Persistence checks that ticket atomically and rejects invalidated replies.
Known denial clears the selected detail instead of treating it as a stale success.
Week invalidation removes its planned-recipe and preparation read snapshots in the
same transaction, while keeping pending operation journals. The sole shipping
preparation snapshot writer also uses a ticket, and preparation denial invalidates
the scoped read copies. This reuses the existing local epoch table, not another
backend, feature or server migration.

Fourteen corrected signed app checks and fourteen focused Foundation/SQLite checks
pass with zero failures/skips. They cover both reproduced bugs, original offline
restart/absence behavior, account/selection changes, week-read denial races,
preparation recovery, stale-ticket rejection, fresh-read recovery and retained
exact preparation commands. [Native results](fixed-summary.json),
[SQLite results](store-results.txt), [executed hashes](source-hashes.json).
Strict formatting, file/function/complexity limits and diff checks pass.

The baseline used the same denial fixture logic before its response helper was
extracted to satisfy the complexity cap. The corrected run uses the extracted
fixture and exact hashed final source. Both runs use real session/API/SQLite code
with controlled Auth/HTTP on separate owned simulators. Both simulators are
deleted. [Baseline cleanup](baseline-cleanup.json), [corrected cleanup](fixed-cleanup.json).
No original clients, hosted household data, server credentials, financial history,
AI provider, worker, push setting or beta submission changes.

Rendered phone behavior, hosted permission changes and other proposal/ingredient
read paths remain unverified. These checks do not close M1/M5 or full authorization
acceptance. Build 22 stays unchanged. Current-source CI remains pending.
