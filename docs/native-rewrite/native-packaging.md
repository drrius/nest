# SwiftUI packaging

The SwiftUI iPhone client lives in `apps/ios`. Native builds and simulator checks run on the authorized Mac. Xcode Cloud archives, signs and uploads TestFlight builds.

## Releasing to TestFlight

Nest uses bundle `ch.drrius.nest`, Apple team `5ZKB6XKYFX`, and App Store Connect app `6814119349`. Configure the Xcode Cloud workflow in App Store Connect or Xcode. The workflow configuration is not stored in this repository.

- Start on pushes to the `testflight` branch.
- Archive for iOS with scheme `Nest` and the Release configuration.
- Use TestFlight internal testing only, with a post-action that distributes to the internal testing group.

Release uses automatic signing with Apple's cloud-managed certificate. No signing certificate, provisioning profile or App Store Connect API key is stored in the repository or GitHub. Xcode Cloud owns release build numbers. Set the next build number in App Store Connect, initially 27 after build 26. `CURRENT_PROJECT_VERSION` is not used for releases.

The Release configuration carries the public backend origins and Supabase publishable key, enables push, and uses production APNs. Debug takes its backend settings from a local xcconfig. `apps/ios/ci_scripts/ci_post_xcodebuild.sh` checks the signed TestFlight export after archive. It reruns `scripts/verify-native-push-signing.py --testflight` and validates the public configuration. A signing or configuration mismatch fails the build.

To ship a commit, obtain the owner's release authorization and confirm that GitHub CI passed on that exact commit. Then push it to the release branch:

```sh
git push origin <commit>:testflight
```

Confirm that the new build appears in TestFlight for the internal testing group. An archive alone does not establish that a build is uploaded, processed or available to testers. Replacing the old app on a phone must wait for its pending offline changes to synchronize.

## Privacy resource

`Nest/PrivacyInfo.xcprivacy` declares app-owned UserDefaults for local calendar selections and first-use choices using CA92.1; these stores do not read another app's defaults. This matches [Apple's UserDefaults reason](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons).

The collected-data declarations cover account name/email/identity, installation identity, expenses/purchases, receipt images, dietary restrictions/optional calorie preferences and other user content (household records, busy intervals and private assistant/memory text). They are linked to the signed-in account, used for app functionality and not tracking. Health here describes user-entered dietary information; it does not add HealthKit or health tracking. Personal calendar names/event text remain device-only. The manifest adds no collection or consent. The schema follows [Apple's collection declaration instructions](https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest) and [data type definitions](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype).

The signed build-1 preparation archive contains both the app manifest and `swift-crypto_Crypto.bundle/PrivacyInfo.xcprivacy`. Source plist parsing or compiler copying does not establish complete App Store privacy acceptance. App Store Connect privacy labels and Apple's final processing remain separate checks.

## Encryption declaration

The native source uses CryptoKit SHA-256 for nonce/command/environment hashes, Security/Keychain for random bytes and credential storage, and URLSession for HTTPS. Audited pinned Supabase Auth uses SHA-256 for PKCE and Security's `SecKeyVerifySignature` for JWT verification. Its Swift Crypto package has `development=false`; forced BoringSSL implementation is conditional on non-Apple platforms, while the iOS Crypto module exports CryptoKit. No custom cipher, SQLCipher or third-party TLS implementation is used by this iPhone target. `ITSAppUsesNonExemptEncryption=false` therefore describes the audited OS-provided cryptography; it does not assert the app has no encryption. Apple's [export documentation requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption) and [plist declaration guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation) informed this declaration. Reaudit it if cryptographic dependencies or use changes.
