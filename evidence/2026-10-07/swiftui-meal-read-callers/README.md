# Shared meal-week reads for remaining callers

The baseline held-reply test fails because proposal preview accepts an already
received week reply after Today processes a newer forbidden reply.
[Baseline failure](baseline-summary.json).

Proposal preview, ingredient refresh and mutation preflight now use the same
scoped read/cache command as Today and Meals. That leaves one shipping API.week
call in the shared command. Existing revision and exact-content checks remain;
preflight still requires an online read and never falls back to a saved week.

Ingredient refresh carries a ticket across its paginated read and checks it before
publishing. Its local choice update validates the ticket in the same transaction
as the sequence-checked save. Invalidated reads cannot overwrite pantry exclusions.
A new authorized read can refresh choices. Pending additions and receipts remain
protected by their existing journal rules. No new backend or schema is introduced.

Thirty-two corrected signed app checks and nine focused SQLite checks pass with
zero failures/skips. They cover held proposal/preflight replies, prior week races,
proposal generation/edit/approval/discard recovery, offline staging refusal,
ingredient retries and choice preservation. [Native results](fixed-summary.json),
[SQLite results](store-results.txt), [executed hashes](source-hashes.json).
Strict formatting, source caps and diff checks pass. Both owned simulators are
deleted. [Corrected cleanup](fixed-cleanup.json). Current-source CI is pending.

The fixtures use real native
session/API/SQLite with controlled Auth/HTTP on separate owned simulators. No
original clients, hosted data, financial history, provider, credentials or release
are changed. [Baseline cleanup](baseline-cleanup.json).

Hosted revocation, device interruption, live generation/approval and full meal
acceptance remain open. Build 22 stays unchanged.
