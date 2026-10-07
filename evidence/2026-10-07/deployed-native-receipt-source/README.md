# Deployed native receipt writer source

Read-only Supabase function inventory and source retrieval on the separate test
project find one active Edge function: `nest-receipt-upload`, version 1, with JWT
verification enabled. All 15 returned application-source/import-map files match
the current local contents. The comparison records local file fingerprints and
the provider-reported bundle fingerprint; no function body or credentials are
copied into this evidence. No deployment or endpoint invocation occurs.

The matched closure includes the handler, canonical receipt contract, byte/JPEG
inspection, identity, reservation, Storage transport and project configuration.
Its existing audited behavior verifies bearer identity and current membership,
reserves inspected bytes under the caller, permits one immutable privileged
Storage insertion, and verifies a caller-authorized matching download. The
existing upload, privacy and membership-race tests retain their evidence; no
unchanged test suite is rerun solely for this source comparison.

The remote response contains the import map but no Deno lockfile or resolved
third-party dependency bodies. Full dependency/runtime parity is not claimed.
ACTIVE metadata does not establish drainage or stop an already dispatched upload.
The test project has no legacy attachment-upload or web-push function deployed;
this is not evidence about Household OS production's writers or invokers.
Managed Storage byte/expiry and native receipt journeys have their separate
dated execution evidence. This comparison does not replace them or close M9.

No users, stored objects, keys, provider calls, worker configuration, production
data or build 23 are changed. [Comparison](comparison.json).
