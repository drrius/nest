# Privileged receipt writer membership

Three focused real disposable PostgreSQL cases pass, zero failures/skips. Existing
reservation-after-revocation refusal remains. A new explicit service_role/BYPASSRLS
insert also refuses the revoked uploader, retains the pending reservation and
creates no object. A second new case inserts under that privileged role, holds
the transaction, observes the concurrent member deletion waiting on an actual
database lock, then commits. Deletion completes afterward; the authorized object
is retained and the fixture's financial-event set stays unchanged.

This establishes membership-gate execution and lock ordering for object metadata
insertion. It does not establish managed Storage bytes/HTTP, all privileged writes,
hosted membership removal, or full migration acceptance. No shipping code/migration,
legacy repository source, hosted object or production data changes.

Configured source limits and focused lint pass; existing Effect advisories for
async Node test code remain warnings. `result.json` identifies the final test hash.
