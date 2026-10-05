# Scope beyond the60-entry public-definer inventory

This fresh read-only [hosted catalog](broader-hosted-surface.csv) contains88
additional retained/shared functions. [Query](broader-hosted-surface-query.sql).
It is an execution-surface inventory, not88 new findings or88 unreviewed writers.
Some service paths and supporting guards already have bounded fixture evidence.
Direct table/Storage permissions and external schedulers are outside this query.

The next client-entry tests have two named targets:

- `archive_household_decision_option_versioned`: current revision succeeds;
  absent/stale revisions and foreign option identities fail under actual RLS.
  A repeated old revision is a conflict, not an idempotent receipt.
- `list_home_attention_records`: owner-household rows only for each partner;
  an outsider sees no rows; anonymous execution and malformed pagination fail.
  Retained inventory/commitment reads do not add those screens to Nest.

The other catalog groups are five client-callable private helpers/trigger functions,
70 private functions without anonymous/authenticated EXECUTE, and11 service-only
public definers. EXECUTE privilege alone does not prove that a trigger function can
be called as an ordinary RPC. Service-only entries include two intentionally revoked
old client overloads already covered by earlier grant checks.

For the remaining cutover proof, map the private paths to their actual callers and
direct table policies instead of assuming every helper is a user command. Existing
full-chain job-pause evidence proves eight paused entry points refuse execution;
pending-job evidence preserves a live outbox claim and queued reminders/drafts.
It does not prove external requests have drained or that deployed schedulers are
disabled. Those require an authorized hosted rehearsal before production cutover.

No executable code, grant, policy, hosted row or job was changed by this inventory.
