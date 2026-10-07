# Consolidated private build22 candidate

SwiftUI0.1.0/build22 is archived/exported locally on the authorized Mac from frozen
sourcef324c905ce0c2129b732b37663f03c4ea4392350,1176 native/helper inputs. The source
project remains build21; the archive command overrides CURRENT_PROJECT_VERSION=22.
All source hashes match, and the actual packaged plist reports22. No cloud build
is used.

The only shipping changes since21 are scoped local Saved changes discovery for a
pending variable bill and Today's consistent onAccent filled-action label. Hosted
lost-save/lost-cancellation recovery and managed receipt expiry have separate
actual native evidence; test-only additions do not themselves change the runtime.

The copied13,695,445-byte IPA matches hash
4c42393e43959f93afd8a5d7868fc33ec918a2cd34f8e8a031b2dade5632649f.
Version/platform/arm64/iPhone-only/test-origin/push-disabled/profile/privacy/dSYM/
forbidden-file checks pass. [Signed package](signed-package.json). It contains no
signing keys, environment files, SQLite data, test targets or React/Expo runtime.
The existing accepted App Store profile/certificate is reused; no credential is
created/revoked. Owned temporary keychain, certificate and password copies are
removed on both hosts, with original credentials and user search list intact.

Apple read-only preflight confirms22 absent and21 valid. Both routine37612410978 and native37612410354 pass the exact frozen source:
509 Foundation/41 skips and496 signed-app/54 skips, zero failures, strict format/
limits/signing and guarded UI compilation. One-use artifact gates pass; exactly
one private submission12d18101-2fef-4cda-a9ef-03a0743bcd10 is queued. No second
attempt occurs. Build21 remains available; Apple processing/availability and
device execution of22 remain unverified.

The candidate uses nest-test and keeps push disabled. Live AI, full accessibility,
physical push, both-phone acceptance and production cutover remain open. No
invitations, purchase, public release or production migration follows from this
preparation.
