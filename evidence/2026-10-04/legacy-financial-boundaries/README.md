# Legacy financial authorization boundaries — 4 October 2026

Four authenticated-executable security-definer warnings now have a bounded source,
full-chain database and hosted negative review. No production/schema/grant change,
source migration, successful hosted financial write or cutover occurs.

## Reviewed entry points

- `post_manual_expense` requires current membership before reading a command
  receipt; validated allocations and composite tenant foreign keys constrain payer
  and category. Centimes remain safe integers.
- `post_refund` derives the household from its source and requires membership,
  serializes the source, respects each member's remaining refund allocation and
  refuses a reversed source. It retains the source payer.
- `correct_financial_event` requires membership before receipt replay, locks its
  source, blocks active linked refunds and appends reversal/replacement rather
  than updating history. Replacement payer/allocation foreign keys remain scoped.
- `record_settlement` verifies membership, serializes household balance, requires
  the current debtor as payer and bounds partial amounts to the outstanding sum.

The deliberately read legacy sources are `20260811200000_chf_ledger.sql`,
`20260812201042_atomic_settlement.sql` and
`20260904230229_money_refund_limits_and_recurring_edit.sql`. These legacy receipt
identities are household scoped; this review does not mislabel them as private
native financial receipts or authorize exposing them in AI tools.

## Verification

```sh
NEST_TEST_PG_BIN=/tmp/nest-postgres/usr/bin node tools/migration/schema-probe.mjs \
  /home/drrius/Work/household-os/supabase/migrations --without-pg-net
```

This creates/cleans a disposable PostgreSQL cluster and accepts no existing
connection URL. All305 inputs apply,54 legacy/251 Nest. Only the exact pg_net
extension declaration is excluded. [Inputs](migration-inputs.csv) and
[schema summary](schema-summary.json) record actual execution and simulated
Auth/Storage limitations.

[52 final cases](cases.json) verify foreign/unaffiliated/missing/anonymous caller
refusal; foreign payer/category/allocation rejection; negative/unsafe amounts;
excess per-member refunds; active-refund correction blocking; both-member
successful commands, exact retries and changed-payload refusal; and nonmember
historical retry refusal. Every successful expense/refund/settlement appends one
entry; replacement appends two. Two-member zero-sum ledgers remain valid. Each
case rolls back. Original full financial rows, receipt references, receipts,
notifications/activity and tenant/category metadata remain unchanged.

[Four compiled functions](compiled-functions.json) equal freshly read
[hosted body hashes, definer/search-path metadata and client grants](hosted-functions.json).
The first metadata hash attempt trimmed spaces only; trimming newlines/tabs as
well establishes the documented source-body comparison. [Eight hosted probes](hosted-denied-probes.json)
use independently verified fictional outsider Auth and anonymous access, and all
return401/403 with SQLSTATE42501. No member write is attempted. The same
[58-event/ledger/allocation/claimed Storage metadata digests](hosted-retention.json)
match before/after under the [fixed read-only query](hosted-retention-query.sql).
Storage row metadata is not a new byte-download proof.

The initial five-parameter helper and82-line verifier lint errors were corrected
by grouping inputs and extracting member-flow verification. The final source
passes focused Oxfmt/Oxlint/source limits, retaining the two existing schema-probe
Effect filesystem/path warnings. [Source hashes](source-inputs.json) bind the
final52-case/compiled metadata report. CI results are recorded separately after
this feature commit finishes; routine CI does not execute this full rehearsal.

## Limits and remaining work

The current public catalog still has81 authenticated-executable definer entries;
none is suppressed. This covers four more legacy entries, leaving37 other public
legacy entries and deeper private paths open. Ownership/service-role grant parity,
complete nested security review, real concurrent radios/clients, live AI approvals,
scheduling/push, phones and production cutover are not established. No new native
execution, beta, purchase, merge or production action occurs. M9 remains incomplete.
