# Consolidated private build 23

The candidate is frozen at `9ecfdca2c66c98dae0df9d906a088c56a42580dc`, with
1,188 native/helper inputs matching the separate Mac source tree. Xcode's local
Release archive succeeds using the existing accepted App Store profile and
certificate. The source project remains build 21; the archive explicitly sets
`CURRENT_PROJECT_VERSION=23`. No Expo cloud build is used.

Compared with available build 22, this candidate includes saved Today meals
during refresh, Money history row spacing, 44-point correction/recurring pickers,
and the meal read-copy/account-context fixes. It changes no product scope and
continues using the separate nest-test backend with push disabled.

The local archive and export pass. The actual IPA reports 0.1.0/build 23,
iPhoneOS/arm64, the expected Apple team and nest-test origins, with push disabled.
Signature, provisioning, privacy manifests, dSYM and forbidden-file checks pass.
The copied 13,725,960-byte IPA matches SHA-256
`8722859b66be95b34ab84f5ffff2e9a4517a2a7ab16f4590895bb36782603fa2`.
Temporary certificate/password copies and the isolated signing keychain are
removed; original credentials and the user's keychain search list remain intact.

Routine CI 37660682366 and native CI 37660682517 pass this exact source. Native CI
reports 512 app tests, 59 guarded skips and zero failures, with strict formatting,
source limits, signing and guarded UI compilation passing separately.

One private submission, `b113adff-6504-4a4f-91e0-4d6304667f94`, is scheduled for
the verified IPA after both CI gates pass. A one-use marker prevents a duplicate
request. EAS reports FINISHED at 17:52:38 UTC. The first subsequent Apple status
read still returns builds 22 and earlier; a later read confirms build 23 VALID,
IN_BETA_TESTING and unexpired. No second submission occurs. Actual installation,
partner tester access and phone acceptance remain unverified.

Live AI, scheduled delivery, full accessibility, both phones' acceptance and
production migration/cutover remain separate requirements. No tester invitation,
purchase or public release is implied by this candidate.
