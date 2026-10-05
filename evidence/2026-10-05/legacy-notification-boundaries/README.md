# Retained notification privacy and device boundaries

Seven retained public commands pass **127 full-chain SQL cases**:92 refusals and
35 member/privacy flows. The final disposable run applies54 legacy and252 Nest
migrations. Only the exact `pg_net` extension declaration is excluded. Local
PostgreSQL18.6 simulates Auth/session and Storage facilities; hosted test uses17.6.

The approved [action inventory](../../../docs/native-rewrite/action-inventory.md)
makes notification settings private between partners. The existing legacy digest
SELECT policy exposed both partners' settings. Its new owner-read policy fixes
that gap without changing INSERT/UPDATE policies or any retained values.
[Migration](../../../supabase/migrations/20261005093322_native_legacy_digest_owner_read.sql)
was created with Supabase CLI2.113.0 and applied once to **nest-test only**.
The source filename is093322; the MCP migration ledger records093551 under the
same name. [Hosted history](hosted-migration-history.json) records this timestamp
difference; compiled/hosted policy expressions match exactly.

Both members, a foreign household, a real fixture outsider and absent identity
exercise endpoint ownership, owner-only inbox/digest/subscription visibility,
private quota/outbox access, missing/oversized input, paused devices, changed-device
or other-member request IDs, one-minute cooldown and five-tests-per-day quotas.
Deleting a device does not reset its member's quota.

Successful flows verify registration/re-enrollment, unregister, all-own-device
sign-out pause, same-operation test replay with one request/outbox row and no
inbox activity, exact queued/accepted/failed status envelopes, caller-only read
marking and preserved old read timestamps, and caller-only digest updates.
Old owner-only quota/outbox cleanup retains live claims and all partner records.
Every positive flow compares complete other-member state and financial rows;
complete original finance/receipts/notifications/excluded records remain exact.
No native push enrollment or notification preference is silently created.

[Cases](cases.csv), [summary](schema-summary.json),
[migration inputs](migration-inputs.csv) and [diagnostic inputs](diagnostic-inputs.csv)
record the final actual run. [Pre-fix diagnostics](pre-fix-diagnostics.json) separate
the initial inbox-count assumption from the genuine partner-preference exposure.
The count check now compares complete inbox/outbox snapshots. The hosted result
observer was corrected to compare JSON properties independently of key order;
it did not repeat successful writes or change an authorization result.

Seven fresh read-only hosted function hashes/grants match the tested bodies.
[Query](hosted-definition-query.sql), [compiled functions](compiled-functions.json),
[hosted functions](hosted-functions.json). All three [compiled policies](compiled-policies.json)
match [hosted policy metadata](hosted-policy-after-rollback.json); writes retain
their [original policies](hosted-policy-before.json).

The hosted legacy digest initially had zero rows. A privileged transaction seeds
two temporary preferences, then switches to actual `authenticated` database roles
and claims: each member sees exactly their own row, and an outsider sees none.
[RLS SQL](hosted-owner-rls-probe.sql), [result](hosted-rls.json),
[preservation query](hosted-policy-checkpoint-query.sql). Rollback is independently
verified by the unchanged complete zero-row hash. This is populated hosted
database RLS proof, not an authenticated HTTP/Apple-sign-in or phone test.

[Fresh advisors](hosted-advisors.json) retain three existing security notices and
two performance notices, with no added security notice or digest-table performance
notice. Existing project-wide advisor acceptance remains open. The unique
[60-entry inventory](public-entry-review-inventory.csv) has54 bounded reviews and
[six pending entries](remaining-public-entries.json); broader helpers/races/old
writers, live AI, native APNs/worker delivery, both phones and full M1–M9 remain.

Scoped Oxfmt/Oxlint/source limits and manifest checks pass; two pre-existing
schema-probe Effect Node-import warnings remain. Routine CI is pending.
No dispatcher, provider inference, new binary/beta, production migration/data
change, purchase, source merge or automation occurred.
