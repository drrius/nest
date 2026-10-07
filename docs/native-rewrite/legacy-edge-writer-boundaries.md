# Legacy Edge writer boundaries

Audited from the local Household OS source on7 October2026. File hashes and three
focused local results are retained in [evidence](../../evidence/2026-10-07/legacy-edge-writer-source/).
No hosted code, credentials, jobs or provider endpoints are inspected or changed.
This complements the [scheduled writer audit](scheduled-writer-audit.md).

| Writer                      | Source authorization and effects                                                                                                                                                                                                                                                                                                      | Remaining cutover evidence                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| household-attachment-upload | User token checked through Auth and household membership; bounded4MB body, inspected type and canonical household/purpose/UUID path. Caller-scoped reserve RPC precedes service-role insertion into household-files with upsert false. Existing-object/error recovery rereads reservation. No object UPDATE or DELETE in this writer. | Match hosted code/dependencies, account for reservations/in-flight uploads and retain bytes/references. Native intent guards and metadata fixtures do not establish actual hosted legacy upload behavior. |
| push-dispatch               | POST-only, configured service credential comparison, at most50 claimed rows with120-second leases. Reads only active recipient/household subscriptions; device tests select one exact ID. Sends external Web Push, disables gone subscriptions by ID/household, finalizes using the exact claim token and retained delivered IDs.     | Match hosted entry/auth/dependencies, inventory invokers and unfinished claims/provider outcomes. A database pause or stale-finalization refusal cannot recall HTTP already sent or prove delivery.       |

Legacy push payloads use generic household messages and old web routes. They are
not a native APNs implementation or Nest deep-link acceptance. Missing VAPID
configuration is deferred, not reported as successful delivery. The native client
does not call these legacy endpoints. Keep legacy consent, devices and pending
work distinct from native opt-ins and tokens.

The legacy subscription registration SQL bounds endpoint/key lengths and membership;
the inspected source does not establish destination allowlisting. Provider library
URL checks, redirects and live endpoint configuration remain unverified. Do not
carry its Web Push transport into the native app or declare that trusted service
writers are fully reviewed from these files alone.

Three existing Deno tests pass with no provider calls or database writes: actual
maximum-size/progressive JPEG decode and trailing-data refusal, plus controlled
exact-device/missing-device/member-wide selection. The selection test injects a
database client; it does not execute RLS, claims or network delivery. Existing
disposable SQL claim/retry/pause tests provide separate database evidence.

The first Deno invocation inherited Nest's package workspace and failed dependency
resolution. Deno added a workspaces field; that tool-generated change was removed
and exact committed package content restored. The successful run used an isolated
working directory with config/lock discovery and local node_modules disabled.
Neither repository receives legacy dependencies or source changes.
