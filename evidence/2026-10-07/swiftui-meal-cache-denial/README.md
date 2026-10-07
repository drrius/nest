# Denied meal-week cache

A known forbidden online read must not be bypassed by reopening Today or switching
back to Meals. The focused baseline test fails because cachedTodayMeals returns
the previously saved week after a 403. [Failure](baseline-summary.json).

The candidate removes only that member/household/week's local read snapshot on a
forbidden week reply. Today and Meals use the same scoped invalidation. Meals
shows a load failure rather than its previous cached week. Existing membership
reverification remains in place. Pending operation journals and partner snapshots
are preserved. Financial history, server data and the normal network-outage cache
fallback are unchanged.

Four corrected signed app checks pass with zero failures/skips. They cover Today
cache reopening, Meals denial with an uncertain placement, normal outage versus
forbidden handling and late-account refusal. [Results](fixed-summary.json).
One focused Foundation/SQLite test also passes, proving restart persistence,
inactive-lease rejection, retained exact pending command and unchanged partner
snapshot. [Storage results](store-results.txt), [executed source](source-hashes.json).
Strict formatting, source caps and diff checks pass.

The checks use controlled HTTP and real local persistence on separate owned
simulators, with no hosted data or credentials. Both simulators are deleted.
[Baseline cleanup](baseline-cleanup.json), [corrected cleanup](fixed-cleanup.json).
Current-source CI remains pending.

This addresses the sequential known-denial/reopen case. Concurrent old successful
reads, hosted permission changes, all meal/recipe cache variants and phone
acceptance are not established here. Build 22 is unchanged; no beta or production
operation occurs.
