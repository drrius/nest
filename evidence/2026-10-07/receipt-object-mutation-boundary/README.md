# Receipt object mutation boundaries

The disposable PostgreSQL/PostgREST receipt-privacy test now checks 12 direct
metadata/path UPDATE attempts. Uploader, partner and foreign actor try both changes
before and after an expense claims the receipt. Every attempt affects zero rows.
Object metadata, financial events/ledger and the attachment registry remain exact.
The test passes with zero failures/skips. Existing uploader-only cleanup, partner
claim refusal and legacy read access remain covered by the same test.

The final full-schema rehearsal applies 311 migrations and passes 22 attachment
boundary cases, including six new direct native/legacy object mutation probes.
All rolled-back original rows remain exact; financial reconciliation preserves
seven events, eight allocations, 14 ledger rows and one receipt reference. Initial
function-length lint failure is corrected by extracting the probe helper; the final
source passes focused lint and the repeated full rehearsal. The existing Effect
async-test advisory remains a warning, not a bypassed source limit.

Auth and Storage metadata are simulated. Managed Storage HTTP/bytes, trusted
privileged UPDATE/DELETE behavior, live external writers and production cutover
remain open. No hosted mutation, credential transfer or production action occurs.
`rehearsal.json` records bounded results, exact source hashes and the private raw
report hash. This test extends the migration boundary evidence, not full M9 acceptance.
