# SwiftUI build 24

Private TestFlight candidate 0.1.0/build 24 is available for internal testing.
Apple reports VALID, IN_BETA_TESTING and unexpired. Frozen source is
`c0c0cf9513da6860efef30676f120b1fdebb5af1`, with 1,190 inputs matching the Mac
copy before archive and after export. Compared with build 23, only the shipping
chore and grocery sync readers change: refused reads reverify membership so
revoked users cannot keep cached household presentation. Valid members retain
saved data. [Focused reproduction and fix](../swiftui-household-read-revocation/README.md).

Exact-source [routine](routine-ci.json) and [native CI](native-ci.json) pass.
Native CI reports 518 app tests, 60 guarded skips and zero failures. Guarded cases
retain their separately executed evidence; skips do not establish device behavior.
[Archive/export](archive-terminal.json) and [signed package](signed-package.json)
checks pass: iPhoneOS/arm64, iPhone only, expected test API/Supabase, push disabled,
privacy manifests, dSYM, signature/profile binding and forbidden-file audit.
Copied IPA SHA256 matches `6cdf7a088b27e6a04bb67f0d32d370b1af913f3705339b478d6a4f49d4c6a05f`.

The existing accepted build16 App Store profile and distribution certificate are
reused. No new certificate/profile, Apple login, revocation or Expo cloud build
occurs. [Mac cleanup](signing-cleanup.json) and [Linux cleanup](linux-signing-cleanup.json)
remove temporary signing material and preserve the original keychain search list.
The source project/version remains unchanged; archive overrides build number 24.

[Apple preflight](apple-preflight.json) confirms the target app and no build24 in
its returned recent inventory. A relative-path preflight error and an unsupported
`--json` CLI flag fail before upload; [flag rejection](submission-cli-flag-failure.txt)
is retained. The corrected invocation consumes an exclusive local marker before
upload and creates one private submission,
`d9792c71-0832-4723-8fd7-536d15769eb1`. [Observed submission](submission-requested.json).
Do not repeat that upload. No new groups/invitations or public release is requested.

[Apple status](apple-status.json) confirms processing and internal availability.
Both-phone installation remains unverified. This build predates the Money setup
error explanation and new request diagnostics.
Live AI, push, phone acceptance and production migration remain separate gates.
No production configuration/data, financial posting, source merge, purchase or
existing-app retirement occurs.
