# Private SwiftUI build 11

Source `d4981cbef686933a644444d8a87a8b56a8dd1bdb` batches the later expense review/keyboard, Calendar consent/warning/all-day mapping, Today navigation, permitted offline refresh/recovery and meal Dynamic Type corrections. It also includes the audited React Native dependency removal. Version is 0.1.0/11; this is the isolated test app, with native push disabled.

## Local artifact

Local archive and export passed on the owner Mac, without an Expo cloud build. Before archiving, all 784 tracked native file hashes matched the committed source, no extra Swift source existed under the app/test source trees, and the temporary visual fixture was absent. Original provisioning was validated for the exact approved team/bundle, Apple Sign In, non-debug App Store distribution, production APNs, expiry and binding to the selected certificate.

The exported IPA was unpacked and verified independently: strict code signature, exact team/application/Apple Sign In, push-disabled production APNs, nest-test origins/publishable-key format, resolved version 0.1.0/11, iPhone-only arm64, compiled AppIcon, both privacy resources, OS-cryptography declaration, original embedded profile and retained archive dSYM. All source hashes still match. Its 10,540,904-byte SHA-256 is `870a88c1bf617a452d81785e1dbf0bf1e1c2f14ea6a9d213092185fdb8dd9dd3`; the Linux copy matches. See [nonsecret metadata](build11-export.json). No credential or IPA is committed.

Archive/export temporarily unlocked only the existing isolated signing keychain, then locked it and restored the exact original user search list. A preflight helper initially used a Python timezone constant unavailable on the Mac; it failed before starting the archive or unlocking the keychain. Correcting that helper allowed the unchanged source to archive successfully.

Paths on the Mac: `/private/tmp/nest-swiftui-build11-20261001.xcarchive` and `/private/tmp/nest-swiftui-build11-export-20261001/Nest.ipa`. Logs: `/private/tmp/nest-swiftui-build11-{archive,export}-20261001.log`. The owner-authorized private submission has started; Apple processing/tester access/phone acceptance remain unverified. This artifact does not enable AI/APNs providers, change production or authorize public release.

## Exact-source CI

[Nest36785676608](https://github.com/drrius/nest/actions/runs/36785676608) and [SwiftUI36785676593](https://github.com/drrius/nest/actions/runs/36785676593) both pass at exact artifact source `d4981cbe`. Native CI executed 211 cases with four explicit opt-in skips and zero failures (207 passed); actual signed-app push-disabled verification passed. These CI skips do not replace the separate hosted fictional SDK checks or phone acceptance. No extra Sol review was requested, following the owner’s waiver.

## Private submission

Existing Nest App Store Connect credentials scheduled [submission bffc8f0e-93f7-4e1e-a663-6d3a2ff08318](https://expo.dev/accounts/drrius-dev/projects/nest/submissions/bffc8f0e-93f7-4e1e-a663-6d3a2ff08318). This is one identified locally exported IPA, not a cloud build or public release. Apple processing, internal availability and partner tester access are pending.
