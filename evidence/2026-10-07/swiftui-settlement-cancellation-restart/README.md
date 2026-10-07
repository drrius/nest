# Settlement cancellation across native store restart

Seven focused disposable PostgreSQL/PostgREST/API cases pass, zero failures or
skips. They cover committed response loss, missing receipts during blocked saves,
revoked membership, lost cancellation replies, rejection of late saves and
protocol-fixture SQLite restart while writes are suspended. The protocol adapters
are test-only; these results do not establish native execution.

Two new signed-app tests use SessionModel, SettlementAPI and the real native SQLite
store with controlled HTTP. They stage once, lose either cancellation or committed
Save response, create a new SessionModel/store instance, preserve the exact command
and cancellation flag, resolve the correct cancelled/recorded outcome and finish
only that terminal operation. Assertions bound Save sends to zero or one. Both
owned signed SE3 simulator cases pass with zero failures/skips. The completed
summary and cleanup receipts are retained. The new test file matches the recorded
SHA256; the copied shipping source is the existing QA mirror, not a newly released
candidate. Exact-current-source CI remains separate.

The focused native run uses a copied source mirror with the new test file, a
separate clean simulator and no hosted credentials or requests. Teardown deletes
that simulator and leaves the original clients untouched. It does not render
recovery controls, prove real provider behavior or close M7. Hosted rendering,
both-phone recovery and full financial acceptance remain open.
