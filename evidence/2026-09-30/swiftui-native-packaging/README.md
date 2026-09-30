# Native packaging and isolated APNs registration

## Compiled icon and iPhone target

New artwork was generated from the approved Nest nest/two-eggs icon reference. The generated 1254px RGB image was mechanically exported with Apple's `sips` to the required opaque 1024px PNG, then added to the native AppIcon asset catalog. Both Debug and Release select AppIcon. The first compiler rejected the wrong pixel dimensions; the corrected catalog passes actual compilation.

Mac logs:

- `/private/tmp/nest-swiftui-icon-release-fixed-20260930.log`: unsigned **iPhoneOS arm64 Release BUILD SUCCEEDED**.
- `/private/tmp/nest-swiftui-icon-debug-20260930.log`: ad hoc signed **iPhone simulator Debug BUILD SUCCEEDED**.
- Compiled Release Info.plist resolves `CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName=AppIcon` and `AppIcon60x60` files. Source icon is 1024×1024 RGB with no alpha.

This is compilation/packaging evidence, not a distribution signature, Apple processing, physical-phone rendering or TestFlight availability. Push remains disabled. No Expo cloud build was started.

## Local distribution preparation

The existing Nest-only App Store profile (`fff5dc55-5170-4433-9529-675cb2d2b8c0`) was downloaded through the supported EAS credentials manager and validated before importing its certificate: exact team `5ZKB6XKYFX`, app `ch.drrius.nest`, Apple Sign In, production APNs, debugging disabled, no device/ad-hoc provision, certificate match and expiry 2027-09-19. All private material remains ignored in protected temporary storage; no certificate/key was created or revoked.

Initial archive attempts found project-wide provisioning leaking into Swift Crypto's resource bundle, then SSH keychain access failure. Release provisioning is now scoped to Nest's app target; a disposable binary proved freshly unlocked/searchable isolated signing works. The corrected archive command unlocks its separate keychain inside that SSH session, prevents idle sleep only during the build and restores the exact original user keychain search list in a finally block. The actual final search list contains only the owner's original login keychain.

Preparation archive `/private/tmp/nest-swiftui-distribution-unlocked-20260930.xcarchive`: **ARCHIVE SUCCEEDED**, actual signed iPhoneOS arm64 app, 0.1.0/build 1, exact test API/Supabase origins, public-key prefix, disabled push, production APNs, approved embedded profile and AppIcon. Both app and Swift Crypto privacy manifests are packaged. The strengthened `--testflight` signature checker passes against the actual app, including exact Nest team and Apple Sign In. Three focused signing regressions pass on Linux and Mac, including a valid foreign team/bundle suffix and missing Sign In refusal. Log: `/private/tmp/nest-swiftui-distribution-unlocked-archive-20260930.log`.

This preparation archive's build 1 is not uploaded. Supported App Store Connect status confirms the latest existing beta is 0.1.0/9, VALID and in internal beta testing; native source advances to build 10. The new native privacy resource, app-scoped signing and audited OS-cryptography declaration are documented in [packaging](../../../docs/native-rewrite/native-packaging.md). Final build-10 archive/export, exact-source CI, Apple processing and phone acceptance remain outstanding. No release/submission or cloud-build credit was used. Prior source `4cf443fd` passed both workflows (`36658646072`, `36658646066`).

## Real hosted Swift registration

`HostedPushRegistrationTests` explicitly requires the exact isolated API, fictional Test Alex, household identity and opt-in environment flag. It uses random synthetic sandbox token bytes and never obtains an Apple token or invokes a provider. The uncredentialed CI test must skip honestly.

Final Mac log `/private/tmp/nest-swift-hosted-apns-registration-final-20260930.log`: **one case passed, zero failures/skips, 14.157 seconds**. Assertions cover outsider rejection, register/exact receipt replay/read/recovery, stale revision refusal, durable cancellation enforcement, unchanged current device, disable/exact replay and recoverable historical registration receipt after disable.

The initial API rejected the APNs contract; server source was stale. The first replacement targeted Vercel Production, where this **test** project had no backend configuration. Runtime diagnostics established that failure and the working stable alias was restored. A preview retry encountered inaccessible workspace metadata; `.vercelignore` now excludes those directories, local credentials and non-runtime artifacts. The configured Preview deployment then passed its anonymous member gate before assigning the stable alias. Four existing deployment/runtime regressions pass locally with no skips; their first sandboxed invocation could not spawn the build subprocess and was rerun with that permission.

Final isolated deployment: `dpl_AXFV8bWxhygAfd7D3QQyi65hXtrZ`, server source `8fbe67d8`, immutable URL `https://nest-test-85rurh9o7-drrius-projects.vercel.app`, stable alias `https://nest-test-api-drrius-projects.vercel.app`. Preview's existing public backend configuration was reused; no environment values were retrieved or changed.

Final test database: one inactive APNs fixture, zero token/hash retained, four device operations (two preexisting and registration/disable), zero APNs attempts and zero cron jobs. Cancellation history remains in its own journal. All 13 financial events remain; full event/allocation/ledger hash equals the original baseline `7c5dd62f66b723e089f44a9917b10e063790b5bd1482ac19d7c84514be9796a8`. No real Apple request, production data change or scheduling occurred. See [installed migration versions and unresolved advisors](../../../docs/native-rewrite/nest-test-setup.md).
