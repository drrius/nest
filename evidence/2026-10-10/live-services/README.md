# Live services, 10 October 2026

The deployed backend uses `openai/gpt-6-luna` with high reasoning for both
assistant and meal generation. No Gemini fallback is configured. The stable
installed-client alias serves deployment `dpl_E3vL88e2rGfgaVCPnZDszXKSSCNB`,
source `7df6121eb75132af8e27087f0b233de945f97d63`.

## Actual verification

- Real Swift assistant read/tool/stream passed against hosted Luna.
- Real Swift meal proposal passed: seven dinners generated; active plan stayed
  unchanged without approval; the proposal was discarded. An earlier 21-meal
  synthetic-library case returned `no_suitable_meals` and is not counted as a pass.
- Two rendered simulator UI cases passed: shared headers and Calendar picker.
  Screenshots and frame evidence are in [ui](ui).
- Push and recurring workers returned 200 with zero failures and no eligible work.
  Vault-authenticated schedules run every minute and hourly respectively.
- Apple rejected a deliberately invalid device token as `invalid_device`.
  This checks provider access, not physical notification delivery.
- Fictional household, three synthetic Auth users and two storage objects were
  removed after verification. The guarded transaction preserved real-household
  row hashes and restored trigger settings. One real Auth account remains.
- Routine CI [38039690524](https://github.com/drrius/nest/actions/runs/38039690524)
  passed. Native CI 38039500471 was still running at this checkpoint.

## Build 26

Built locally on the authorized Mac, then submitted once using existing EAS
submission metadata. No Expo cloud build was used. Apple reports VALID and
IN_BETA_TESTING; it is available to existing internal testers. Production APNs
entitlements and push are enabled. No public release or new invitations occurred.

[Signed package](signed-package.json) records the archive-time audit (its upload
field predates submission). [Apple status](apple-status-final.json) records the
subsequent availability. Source was frozen at `559ee9ab`; later commits changed
backend behavior only. IPA SHA-256:
`145c775cc0b121c1143e437c6b966ecf3cda6a7fd1037ed48ce25b6bab4dac52`.

## Remaining

Leah must first try Apple sign-in; her verified account is not present yet. Then
link it to the real household and verify Money from both accounts. Both owners
still need phone acceptance, Calendar privacy and physical notification delivery.
No new Gateway API key was created; server access uses Vercel OIDC. Secrets are
server-only. The existing $1 nonrenewing project budget remains in place.
