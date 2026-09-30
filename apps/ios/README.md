# Nest for iPhone (SwiftUI)

This is the replacement client selected by the owner on 27 September 2026. SwiftUI screens use the existing authorized backend and an environment/member-scoped SQLite journal. Focused simulator, hosted and CI checks cover selected commands, recovery, account changes, calendar privacy and notification routing. SwiftUI 0.1.0/build10 is internally available in TestFlight against the isolated test backend with push disabled. Apple sign-in on physical phones, complete two-member acceptance, live AI and real APNs delivery remain unverified. Later expense keyboard and maximum-text fixes are not in build10. The former React Native client and dependencies are removed. See [ADR 0002](../../../docs/adr/0002-swiftui-client.md), [progress](../../../docs/progress.md) and [distribution instructions](../../../tools/distribution/README.md).

On a Mac with Xcode 27 and an iOS simulator:

```sh
cd apps/ios
swift test
xcodebuild -project Nest.xcodeproj -scheme Nest -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -xcconfig /path/to/local-public-test.xcconfig \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test
```

The bundle ID is `ch.drrius.nest`, matching the existing Apple Sign In audience. The Sign In with Apple entitlement is committed, but no private credential, local session or backend URL is committed. Supply `NEST_API_URL`, `NEST_SUPABASE_URL` and `NEST_SUPABASE_PUBLISHABLE_KEY` as local Xcode build settings for the isolated test backend. In an `.xcconfig` file, write URL values as `https:/$()/your-host.example` because Xcode treats an unescaped `//` as a comment. Only `sb_publishable_` keys are accepted. An unsigned simulator build compiles but cannot exercise Keychain session persistence (`errSecMissingEntitlement`, -34018); the ad hoc signature above is required for auth testing. The offline SQLite file is scoped to the configured Supabase URL as well as the verified actor and household. Installing this target over the former app on a device must wait until any queued offline changes in that app have synced. A simulator build is not a signed phone release, and contract tests do not establish phone behavior.

Push delivery is default-disabled with `NEST_PUSH_ENABLED=false`. Debug builds explicitly use `NEST_APNS_ENVIRONMENT=development`; Release uses `production`, independent of whether enrollment is enabled. The same value supplies the public app configuration and `aps-environment` entitlement. Before enabling enrollment, verify the **actual signed app**, not just the Xcode settings:

```sh
python3 scripts/test-native-push-signing.py
python3 scripts/verify-native-push-signing.py /path/to/Nest.app
# Run on the final exported distribution app before private TestFlight submission:
python3 scripts/verify-native-push-signing.py /path/to/exported/Nest.app --testflight
```

These commands run from the repository root. The distribution check requires a production push entitlement, debugging disabled and exact signed Nest application/team identity. It does not validate the Apple provisioning profile's expiry, hosted migrations, scheduler credentials or delivery. The client never infers the push environment from `DEBUG` or uses private entitlement APIs. Enrollment requires an explicit native action, permission and a fresh Apple token callback; the protected journal associates its exact original Auth session before any write can leave the device. Uncertain enrollment remains available for read/cancel recovery, and cannot silently rebind to a later sign-in. Simulator injection verifies notification UI/routing only; a simulator cannot use the native enrollment controls to claim an Apple connection.
