# Meal-week reads arriving after denial

The signed baseline proves that an already received successful Today reply can
arrive after Meals receives a forbidden reply and restore the denied week.
[Baseline failure](baseline-summary.json). The held response is captured before
the denial, so the test does not rely on a random request order.

The shared week-read/cache command now captures a scoped SQLite epoch before the
HTTP read. Denial advances that epoch and removes the cached snapshot in one
transaction. A reply carrying an older epoch cannot save, return through that
command or clear pending journals. A new authorized read can repopulate the cache.
The transaction retains monotonic week revisions and existing receipt reconciliation.

Today, Meals, move/leftover recovery and manual/saved-recipe replacement cache
writers use the shared command. No shipping SessionModel caller uses the unfenced
saveMealWeek method; that method remains for trusted test fixture setup. Account,
lease and generation checks still surround asynchronous boundaries. Known denial
also clears the selected Meals presentation. This adds only local read metadata,
not a server migration, offline mutation queue or alternate shipping client.

Six focused SQLite checks pass. They include rejection of both old tickets,
reopening SQLite without allowing an old ticket, fresh-read recovery, pending
command preservation and scope isolation. [Storage results](store-results.txt).
The final native run passes 34 affected app tests with zero failures/skips,
including both held-reply orders and move/leftover/replacement recovery.
[Final results](final-summary.json), [exact executed source](source-hashes.json)
and [cleanup](final-cleanup.json). The intermediate run is retained separately;
the final run includes the tightened asynchronous checks. All three owned
simulators are deleted. Strict formatting, source limits and diff checks pass.
Race source `4192478a` is pushed in `f3931206`.
[Routine CI 37639324481](https://github.com/drrius/nest/actions/runs/37639324481)
and [native CI 37639324200](https://github.com/drrius/nest/actions/runs/37639324200)
pass at that exact source. Local race execution remains distinct from CI and
physical-device acceptance.

The fixtures use actual SessionModel, typed API and SQLite with controlled Auth/
HTTP on separate owned simulators. They do not prove hosted permission changes,
phone radio behavior, every other read-only recipe/proposal path or full meal
acceptance. Original clients, hosted data, financial history and credentials are
not changed. Build 22 remains stable, with no new beta or production operation.
