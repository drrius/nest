# Retained routine lifecycle boundaries

A bounded review now covers `pause_routine`, `unpause_routine`, `archive_routine`
and `skip_occurrence`. Each derives its household from the locked target and
requires current authenticated membership before mutation. Pause cancels pending
reminders once; resume refuses archived rules and restores the existing window
and reminders once; archive retains the current/closed history, cancels reminders
and removes only the open preview. Skip delegates to the existing closure engine,
with membership checked before its serialized household receipt lookup. These are
retained behavior, not additional Nest features. No shipping SQL was changed here.

[Twenty full-chain rolled-back SQL cases](schema-probe.json) pass: foreign member,
unaffiliated and anonymous denial for all four commands, then both authorized
members' transitions/exact repeated replies. Reminder cancellation/restoration,
recipient-only visibility, zero completions, open-window/skip state and no duplicate
activity pass. All original routines, occurrences, completion/receipt/activity/notice/
reminder rows and full financial history remain equal after rollback. The305-migration
rehearsal also passes prior31 parent/date,36 calendar/search/tenant and16 attachment
boundaries, epoch/AI dispatch and committed financial recovery.

The first helper exceeded the four-parameter lint limit and was reduced before
completion. The extended reminder observer initially expected A to see B's private
reminders; the actual RLS correctly returned zero. The corrected final observer
requires A's zero and B's own pending count. No permissions, shipping rules or
source limits were weakened. Focused Oxfmt/Oxlint pass; existing schema-probe Node
filesystem/path warnings remain explicit warnings.

[Fresh hosted definitions](hosted-proof.json) match all four bodies in the deliberately
audited original `20260809210000_routine_engine.sql`, SHA256
`e3441544c85fe74dbefe775880aefb383409efcd11c1728d637616211c5296bb`. Empty search
paths and authenticated/anonymous ACLs match. [Eight real Auth/PostgREST negative
probes](hosted-negative-probes.json) deny outsider/anonymous callers, with exact
full routine/closure/finance/attachment digests retained. No valid member mutation,
notification delivery, new hosted schema/configuration or native run is attempted.

This does not establish every paused/archived race, revoked membership/concurrency
variant, native/phone delivery or live AI. Forty-four other public legacy functions
and deeper private paths remain. [Routine CI](ci-results.json) passes exact source
2e114f04 in run37213217127, including formatting/lint/limits/typechecking and focused
existing checks. The20 full-chain lifecycle cases have local execution evidence;
no new deep or native run is claimed for them. No production
access/mutation, purchase, beta, merge or worker activation occurred.
