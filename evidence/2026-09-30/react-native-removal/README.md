# React Native client removal — 30 September 2026

The owner's SwiftUI decision and explicit permission to remove the former client govern this cleanup. The tracked-file audit records 1,241 original paths with their original SHA-256: 501 files removed, including 341 TSX screens/hooks/routes, and 740 framework-independent files moved to the private protocol fixture package (497 source files and 243 tests/helpers). Retention follows reachability from meaningful tests and backend integration fixtures; no TSX or React dependency is retained.

`@ai-sdk/react` was the only framework import in that retained source. Its Chat wrapper is replaced with a small in-memory `AbstractChat` state implementation using the pinned AI SDK. The stop-stream integration assertion now waits for an actual partial message instead of a React-private subscription callback; it still requires HTTP abort, an interrupted saved turn and exactly one model invocation. No assertion on authorization, receipts, approvals or financial arithmetic was weakened.

The lockfile removes the former mobile importer and framework lint plugins; frozen installation removes 657 installed packages. The dependency query for React, React Native, Expo and the React AI adapter is empty. Lint rejects future framework package imports and keeps the existing 400/80/10 source limits. The coverage guard still selects all 202 root unit files exactly once. Backend runtime imports do not consume the unexported fixture package; its source/tests are excluded from deployment uploads.

Local verification:

- Frozen install, full workspace typechecking, full lint/Swift source limits and tooling guards pass.
- All 202 root unit files are covered: the composite run passed 201, while calendar day properties initially hit sandbox child-process `EPERM`; the same file passed its two property cases when rerun with child-process access. This was not a product or assertion change.
- Workspace tests pass: 43 domain, 30 AI, 19 receipt-upload and 396 API cases, with zero skips.
- The selected real PostgreSQL 18.6/PostgREST 16.3/HTTP integration batch initially passed 19 of 20; the React-private callback assertion failed. After replacing that obsolete callback, all five actual SDK streaming/retry/history/stop cases pass. The other 15 approval/isolation/offline/conflict cases passed unchanged. Model/Auth responses are controlled fixtures; this is not live AI or phone verification.
- A separate final run of the routine CI HTTP/database selector passes all 11 cases with zero skips (5.314 seconds). Full formatting and the production API bundle also pass; the bundle contains no protocol fixture imports.
- The initial database invocation could not find `initdb` in the `pg_config` directory. Verification used the already installed fixture binaries, with no skipped database cases.

Existing EAS project/status reads work from the dependency-free `tools/distribution` directory, which has submission metadata only. Supported status still reports build10 valid and internally available. No cloud build or new submission occurred. Existing ignored private signing/config files were moved byte-for-byte with restrictive permissions; their values are not in the audit or evidence. An empty root manifest created during CLI discovery was removed after the correct leaf metadata directory resolved the existing project.

This increment changes no Swift runtime, database migration or hosted deployment. Build10 remains exact source `127c34fa`; the two later expense fixes are separately verified but are not in that artifact. Legacy backend Expo HTTP compatibility transport remains for a separate audit; the app framework and dependencies are removed. Historical docs retain their dated evidence. All M0–M9 acceptance gates, production and phone verification remain open. New-head CI will be recorded separately from these local results.
