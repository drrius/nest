# Consolidated candidate 20

Source `0ba4a5c3`, version 0.1.0, build 20, is archived and exported locally on
the authorized Mac. All 1,157 frozen source files match immutable Git bytes.
The package contains accumulated layout, expense-form and approval fixes since
build 19. It uses nest-test and keeps push disabled.

## Package and signing

The existing certificate and accepted App Store profile are reused in a temporary
isolated keychain. No certificate is created or revoked. Archive, export and
package audit pass: native arm64/iPhoneOS, build 20, unchanged bundle/team, correct
test origins, packaged privacy manifests, retained dSYM and no signing key,
environment file, SQLite/test target or React/Expo framework. The copied IPA
matches SHA256 `a06fbcb89776a1ba0060055ab3e56f6aed2fc5b11a3e0cc017f1e55c2336c019`.

A reused evidence label initially said 19 although the actual artifact assertion
checked 20. That label is corrected from the verified Info.plist without rebuilding.
Both hosts' temporary certificate/password copies and the owned keychain are
removed; original credentials/search list remain intact.

## Verification

Candidate routine CI37578558002 and native CI37578558027 pass at the exact source.
Native checks report 509 Foundation cases with 41 skips, 478 signed-app cases with
41 skips and four Swift Testing cases, zero failures. Formatting, source limits,
actual push-disabled signing and guarded UI compilation pass. Skipped cases and
UI compilation do not establish rendered/device execution.

Deep CI37577691207 passes at `018578ef`: 23 HTTP/database journeys, 50 conflict/recovery
cases and 1,272 isolated database/RLS cases, zero failures/skips. The candidate has
identical apps/api, packages, Supabase, tools/migration and database/integration
test inputs. It differs in native proposal staging/tests/version and docs, covered
by the candidate native gate. This is not hosted production acceptance.

## Private delivery

A fresh supported Apple preflight verifies build 20 absent and build 19 valid for
internal testing. The guarded controller checks the exact CI source, package hash,
Info.plist and absence before submitting once. Submission
`aaf2ad8e-6698-42b1-b8e7-7d14d9b07992` finishes successfully. The first supported
Apple post-upload read does not list build 20 yet; a later supported read confirms
VALID/IN_BETA_TESTING/unexpired. Actual installation and partner tester access
remain unverified. There is exactly one submission, with no second upload.

No EAS cloud build, expanded invitation, purchase, production operation or public
release occurs. Live AI, push and full M1–M9/phone acceptance remain open.

Build 20 is now available for internal TestFlight testing. The
[short phone pass](../../../docs/native-rewrite/build20-first-phone-pass.md)
checks the accumulated layout/navigation changes; full device acceptance remains
separate. The worker logs independently confirm App Store Connect upload success.
