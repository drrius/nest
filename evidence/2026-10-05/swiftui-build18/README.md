# SwiftUI private build18 preparation

The candidate reserves0.1.0/build18 and includes the shared four-tab Quiet header,
20pt side/14pt top padding and Calendar cards verified in light/dark/maximum text.
It also includes the verified credential-refresh ordering, unsent chore draft and
recipe fresh-write/44pt toolbar fixes since build17. Seven native dinner placements
and both-account readback are separately verified; full M5 is still open.

Sourcea3f72078 has a signed Mac archive/export:13,559,941 bytes, SHA256
`7c70b2ff0a6a1a548df9f5528c0c0bf19007c48ecacb0ffe018e19df0f981a74`.
All1,074 source inputs match before archive/after export; the copied IPA has the
same hash. Apple sign-in, App Store signing/profile binding, version/bundle/test
origins, privacy manifests, retained dSYM, arm64 and opaque1024px default icon pass.
Push remains disabled. [Signed package](signed-package.json), [inventory](native-inputs.json).

The cleanup helper initially refuses before touching credentials because its
copied guard still expects17. The corrected guard checks the verified18 package;
temporary signing keychain/certificate/password copies are removed on both hosts,
original credentials/search list preserved. No archive/export is repeated.
[Recovery](signing-recovery.json), [cleanup](signing-cleanup.json).

The supported Apple preflight confirms18 absent and17 internally available.
[Preflight](apple-preflight.json). Exact-source Nest37367380893 and
SwiftUI37367380997 are tracked separately. Native CI passes496 Foundation/41
skips and439 signed-app/17 skips with zero failures, strict format/source limits,
actual signing and guarded UI compilation. [Receipt](native-ci.json),
[actual totals](native-ci-excerpt.txt). The routine job fails before any step with
runnerId0 and a runner-allocation annotation. Attempt2 fails identically before
any step. The separate move-source routine run37369824038 then succeeds on the
same runner configuration; this changed availability justifies one attempt3 on
the unchanged release commit. Attempt3 also fails before any step at20:52:20 UTC,
with runnerId0; [receipt](routine-attempt3.json). Back off until availability changes.
The release gate is not bypassed. [First failure](routine-attempt1.json),
[second failure](routine-attempt2.json),
[GitHub incident](github-actions-incident.json).
No build18 upload or availability is claimed. One private submission and Apple's
availability check remain pending. No cloud build, purchase, production change,
expanded invitation, public release or merge occurred. After availability, use
the [short phone layout check](../../../docs/native-rewrite/build18-first-phone-pass.md).
