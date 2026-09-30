# Private native distribution

This dependency-free directory supplies the existing EAS submission service with Nest's project, Apple app and team identifiers. Its `app.json` uses the service's required metadata envelope; it contains no framework runtime, plugins or SDK. `eas.json` has submission settings only. The iPhone app is compiled, signed and exported from `apps/ios` on the Mac; there are no cloud build profiles here.

Using the already authenticated global EAS CLI:

```sh
cd tools/distribution
eas project:info
eas submit:status --platform ios --profile testflight --json --non-interactive
# Submit only an approved, verified, locally exported IPA:
eas submit --platform ios --profile testflight --path /path/to/Nest.ipa --non-interactive
```

The read-only commands resolve existing project `aca37c4f-1bcd-4e9a-a695-37e794f97933` and App Store Connect app `6814119349`. On 30 September, supported submission status confirms SwiftUI 0.1.0/build10 is valid and internally available. That binary remains exact source `127c34fa`; changing metadata does not upload a build or install an app.

Existing private signing files were moved here byte-for-byte and remain ignored with restrictive permissions. The archived `.env.legacy-client` is ignored and is not loaded by these commands. Do not commit credentials, session tokens, signing keys or passwords. This entire directory is excluded from backend deployment uploads. A private beta does not authorize production migration, purchases or public release; those gates stay separate.
