# Nest for iPhone (SwiftUI)

This is the replacement client selected by the owner on 27 September 2026. The Xcode project builds, and an ad hoc signed simulator build read a fictional chore from the isolated test API after restoring a test session. Apple sign-in, chore completion by native tap, offline recovery and phone execution still need verification. The former Expo client is reference material until all agreed flows are rebuilt and verified. See [ADR 0002](../../../docs/adr/0002-swiftui-client.md) and [progress](../../../docs/progress.md).

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
