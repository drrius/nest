# Managed receipt URL expiry

One selected signed-native SDK method passes against real nest-test Auth/API and
managed Supabase Storage, zero failures/skips. It reads the existing fictional
posted640-byte PDF without uploading, removing or recording anything. The actual
signed URL has a60-second issued/expiry interval. Initial download returns200.
After62.54 seconds the same URL returns400/InvalidJWT with an explicit exp-claim
timestamp failure. A fresh authorized URL returns200 and byte-identical content.
[Expiry proof](expiry-proof.json), [result](result.json). Signed URLs, tokens and
raw payloads are excluded from evidence.

The first invocation skips because direct xcodebuild environment variables do not
reach the test host; that skip is not counted. The selected plan then executes
but fails an assertion expecting the word expired. Its400/fresh200 observations
remain a failed case. The final assertion accepts the precise exp-claim timestamp
failure and requires InvalidJWT. It passes without changing authorization, timing
or status assertions. No unconditional diagnostic flag from the failed test is
treated as evidence. Both earlier outcomes remain recorded.

The existing posted-PDF check now shares the same guarded fixture lookup; its
exact-byte/hash and shares assertions remain. This method establishes expiry for
this object, backend and observed cache path. Supabase documents that Smart CDN
cache lifetime can outlive signed-token expiry:
[official guidance](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
The upload service already requests no-store, but this result does not prove every
legacy object's cache policy, immediate signed-link revocation, every CDN edge or
physical browser behavior. Those limits remain explicit.

Both original members,64 empty journals, display settings and local privacy choices
restore; [restoration](restoration.json). Native compilation, format and source
limits pass. Current-head CI remains pending. No server key is exported, production
data touched, provider model called, beta submitted or cache policy modified.
