# Retained routine history repair

Six focused real PostgreSQL cases pass with zero failures/skips in0.8 seconds.
They use the deliberately audited routine closure/edit fixture and native creation
migration, not a hosted database or complete migration-chain replay. No shipping
SQL changes. The cases are included in focused routine CI and the existing deep
database wildcard; their current-head CI is still pending.

Literal expected dates cover monthly31 clamping in ordinary/leap February,
rescheduled biweekly recurrence using its original anchor, and after-completion
day/week intervals using the actual completed date. Alternating assignments
advance to the partner and back. Full closed occurrence/completion rows remain
identical; repeated repair preserves every generated row and identity. The missing
preview case preserves its rescheduled current row exactly and follows the original
biweekly cadence.

The first five cases pass; adding the preview case also passes. Initial scoped
lint rejects ambiguous heterogeneous tuples. Named case fields correct inference
without casts or assertion changes, and final scoped lint/format plus all six
cases pass. [Result](result.json).

This proves the isolated retained window function at these edges. It does not
prove the scheduler selects preview-only gaps, the current hosted function identity,
transfer interactions, active-window bounds, all calendars or production cutover.
The source scheduler intentionally selects routines missing an open current;
preview-only maintenance requires a separately chosen repair path. No job is
registered or invoked against hosted data.
