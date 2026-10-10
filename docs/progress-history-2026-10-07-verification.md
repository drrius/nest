# 7 October verification checkpoints

These dated source-specific records are retained from the active progress log.
The current [progress](progress.md) and [remaining acceptance](native-rewrite/remaining-work.md)
identify current blockers and candidate status.

The new read-only scheduled-writer inventory is integrated into the disposable
migration runner and focused CI selection. Thirteen local PostgreSQL checks pass
with no failures or skips across the new inventory and existing privilege/fence
checks. They cover missing/restricted/unsupported/truncated catalogs, unknown and
inactive jobs, hashed commands/functions without exported bodies, unchanged rows
and refusal of an already writable transaction.
Evidence (historical artifact removed).
Real pg_cron execution, hosted identity and drainage remain unverified.
This change does not require another phone build. Source `e724fe87` passes routine
[CI 37615820449](https://github.com/drrius/nest/actions/runs/37615820449).

CI now has a conservative documentation-only path. It retains
formatting, relative-document link checks and its own scope tests. Application
checks can be omitted only for docs/evidence Markdown changes whose base commit
already passed CI; unknown/failed/pending bases and all other changed files keep
the full checks. Four local Git/CLI cases and full source
[CI 37616655593](https://github.com/drrius/nest/actions/runs/37616655593) pass at
`7911bb76`. Actual documentation-only
[CI 37617123884](https://github.com/drrius/nest/actions/runs/37617123884) passes at
`245a754d` in 31 seconds with format/link/scope checks; application checks are
explicitly skipped against the already verified source. This is documentation
verification, not another native or domain test run.

Variable-bill Save/cancellation now has both commit orders verified through the
native session, real local Effect API, PostgREST/PostgreSQL and SQLite restart.
Two API and two signed native cases pass without skips. Actual database lock waits
force each order; recorded outcomes retain one expense and cancelled outcomes
retain none. Terminal replay sends no second write. Authentication/session entry
is controlled, so hosted/Apple/phone/UI-race and live-AI acceptance remain open.
Ordered race evidence (historical artifact removed).
Shipping runtime/configuration remains unchanged. Source `a1aa923d` passes routine
[CI 37627414604](https://github.com/drrius/nest/actions/runs/37627414604) and native
[CI 37627414734](https://github.com/drrius/nest/actions/runs/37627414734). Native CI
reports 498 app tests, 56 guarded skips and zero failures. The two ordered native
cases ran separately on the Mac without skips; CI skips do not replace them.
