# Nest progress

## 19 September 2026 — M7 pure CHF rule extraction

Audited legacy CHF parsing, equal/exact allocations, balances and meaningful tests. Added a dependency-free pure domain package with exact parsing/formatting, equal/exact/percentage allocations and validated zero-sum balance derivation. BigInt avoids unsafe intermediate arithmetic. Percentage half-cent ties favor the payer; 50% matches equal split. Opening and reversal entries remain part of derived balances.

Six tests pass, including four reproducible 1,000-case property runs over safe integer amounts, percentages and balanced histories. TypeScript 7 and scoped lint pass. This is independent M7 groundwork, not financial posting, storage, approvals or a native Money vertical slice. See `packages/domain/README.md` for deliberate differences from the audited legacy helpers.

PR #4 adds the native chore receipt migration candidate and ten real PostgreSQL fixture tests; current-commit CI passes. PRs #1–#4 remain open awaiting explicit Greptile review. No production changes or merges. Native verification and full legacy recurrence compatibility remain separate gaps. The removed overnight automation stays removed.

## 19 September 2026 — M2 transactional chore receipt candidate

Implemented a gated additive migration wrapping the existing chore-completion engine. New receipts bind household, verified actor, operation UUID and exact request. Retries return the stored outcome; changed payloads fail. A partner who completed first remains the recorded completer, with an honest already-completed acknowledgment. Stale/rescheduled/skipped occurrences conflict. Completion and receipt commit or roll back together. Receipt RLS is actor-only with current membership, and direct writes/anonymous execution are denied.

Established real local PostgreSQL 18.6 fixture testing without Docker: verified and extracted the matching signed server package to `/tmp`, then used disposable clusters on private Unix sockets with TCP disabled. Ten tests pass, including simultaneous partner completion, duplicate operation races, rollback and RLS. Fixture clusters are removed after tests. The closure fixture does not prove the full legacy recurrence engine; actual-schema compatibility/old-writer races and Supabase advisor checks remain before any production migration. No production changes or data access occurred.

This is partial M2 source/database work. It is not wired to native/API/AI yet. PR #1 documents delivery gates; #2 contains the dev-only native preview; #3 contains bearer identity. All remain unmerged awaiting explicit Greptile review. Native execution, offline SQLite and M3–M9 remain outstanding. The owner removed the overnight automation; do not recreate it from stale goal text.

## 19 September 2026 — M2 bearer identity boundary

Implemented an Effect v4 Request/Response handler for `GET /v1/session`: validate bearer token with Supabase Auth, then read current membership under the same token. Reject anonymous identity, missing/multiple/mismatched memberships, malformed responses and secret-key configuration. No actor identity from client fields or editable metadata. Requests use Effect HTTP services with cancellation, bounded timeout and safe non-cacheable failures. No deployment, database changes or production access.

Ten HTTP-boundary tests pass using a local fixture server: invalid headers without network access, real adapter request/response validation, concurrent-member isolation, outsider/ambiguous membership rejection, anonymous rejection, safe upstream failures, cancellation/method handling and configuration restrictions. TypeScript 7 passes. These fixtures do not prove actual database RLS or live Supabase auth; native sign-in and backend wiring remain unimplemented.

Local Docker API access is denied even outside the sandbox. Investigate a standalone isolated PostgreSQL route before counting RLS/financial database checks as verified. The sandbox also prevents the fixture HTTP server from running normally; tests pass with explicitly permitted loopback access. Added these focused tests to routine CI.

Open work from other branches: PR #1 delivery contract and PR #2 development-only native preview. No merges; current-commit Greptile reviews remain required. The owner removed the overnight automation; continue this task without automatically recreating it. M0/M1 are partial, M2 is in progress, and M3–M9 are not implemented. No complete vertical slice or device verification is claimed.

## 19 September 2026 — native interaction shell (partial M0/M1)

Implemented a development-only four-tab Quiet preview with separate native stacks, shared grocery navigation/state, one-tap sample chore completion, individual dinner replacement, calendar layer toggling and preview reset/exit. Every screen identifies fictional data. Release JS guards preview routes; no backend/auth/AI/financial/offline functionality is claimed. Generated and installed Nest icon artwork. Screens/components remain outside the route directory.

Native lint, TypeScript 7 and the existing tooling-contract test pass. The iOS Metro export succeeds (1,340 modules); this is bundle evidence only, not native execution. Compatible React DOM, Worklets, Reanimated and Metro versions are explicitly pinned after detecting incompatible auto-selected peers. The existing Expo lint dependency's TypeScript peer range still excludes TypeScript 7; no compiler downgrade or diagnostic bypass was introduced.

EAS project `@drrius/nest` is linked on the Free account with isolated development identifier `ch.drrius.nest.dev`. Available iOS build quota was checked (0/15 used); no build/purchase/release occurred. Simulator availability returns false; Linux has no local iOS runner. Prepared internal-development profiles and a Maestro smoke procedure, **not executed**. See [native verification](native-rewrite/native-verification.md) for exact commands and device gaps.

The owner requested removal of the overnight automation. The tool reports it absent and no matching local automation configuration remains. Continue the active implementation task without recreating that automation.

PR #1 (delivery contract/action inventory) has passing CI at `baa1483`; Greptile review was requested once and remains outstanding. No PR merged. M0/M1 remain partial; M2–M9 remain unimplemented. Next: real bearer membership/auth services and durable operation slice, plus native execution when a supported host/device becomes available.

## Milestone checklist

“Complete” requires each milestone's exit criteria in the implementation plan. A partial implementation or successful bundle is not native verification.

| Milestone                           | Implementation                                                   | Local / CI evidence                                                        | Device / external gate                                                           |
| ----------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| M0 Decisions and verification route | Partial: tooling, ADR/action inventory, isolated EAS dev project | Existing tooling evidence below; delivery documentation formatting checked | Prepared smoke, not run; EAS Simulator unavailable; no local iOS runner          |
| M1 Quiet native interactions        | Partial: development-only Quiet native preview (PR #2)           | None                                                                       | Native usability/accessibility review pending                                    |
| M2 Authenticated offline/AI slice   | In progress: bearer identity boundary (PR #3)                    | None                                                                       | Isolated backend, provider streaming and native journey pending                  |
| M3 Identity/onboarding/settings     | Not implemented                                                  | None                                                                       | Existing-member Apple identity and device refresh pending                        |
| M4 Today/chores/groceries           | Not implemented                                                  | None                                                                       | Two-device retry/conflict journey pending                                        |
| M5 Meals/AI proposal/ingredients    | Not implemented                                                  | None                                                                       | Real proposal/approval/provider journey pending                                  |
| M6 Calendar/privacy                 | Not implemented                                                  | None                                                                       | Two iPhones with real calendars, permission/revocation checks pending            |
| M7 Money/recurring                  | Not implemented                                                  | None                                                                       | Fixture ledger reconciliation and controlled scheduler pending                   |
| M8 Renewals/reminders/push          | Not implemented                                                  | None                                                                       | APNs enrollment and physical delivery pending                                    |
| M9 Migration/release rehearsal      | Not implemented                                                  | None                                                                       | Both-member usability, release binary, separate cutover/release approval pending |

## 19 September 2026 — autonomous delivery setup

- Read the approved product/design, architecture audit and implementation plan. Added [ADR 0001](adr/0001-native-delivery-contract.md) and [first-release action inventory](native-rewrite/action-inventory.md). The inventory is explicitly planned, not a list of working commands.
- Updated the superseded merge rule to the owner's latest authorization: small feature PRs; latest-commit CI plus explicit clean Greptile review and resolved conversations before squash merging. Production, spending and release gates remain separate. The current CI only verifies source; it has no deploy/migration step.
- The existing heartbeat was initially updated in place. The owner subsequently requested its removal; deletion reports it absent and no matching local automation config remains. Continue this task without recreating that automation.
- GitHub access verified; no open PRs at initial inspection. Working branch: `codex/native-delivery-contract`. No PR merged in this session yet.
- Read Expo overview, native UI, UI, Router, dev-client and EAS simulator guidance. Current pins are Expo 57.0.23, Router 57.0.21, React Native 0.86.3 and Effect 4.0.0-rc.115.
- `eas whoami` succeeds. CLI exposes `simulator:availability` and simulator automation commands. Nest is now linked to EAS project `b733c351-a149-4b49-b9df-e8c2a14514e2` on the Free account. The follow-up availability check explicitly returns `available: false`. Linux has no `xcrun`, so local iOS execution is unavailable.
- Audited legacy app configuration and root session gate as reference only. Its development profile enables mock data and simulator-only builds; do not copy those defaults into Nest. Keep release/bundle identity deliberate to avoid replacing the existing app during development.

### Exact outstanding setup

1. Nest development bundle `ch.drrius.nest.dev` and EAS project are configured in PR #2. Free iOS quota was 0/15 used; no build started. Physical signing/install and an executable native runner are still needed; Maestro smoke is prepared but not run.
2. Provision only local/isolated fixture backend for development; real production migration remains forbidden. No server/provider credentials have been copied or printed.
3. Physical tests will need both members' iPhones with a matching development build, existing Apple identities and selected device calendars. APNs, Keychain, background behavior and usability cannot be inferred from Linux typechecks.

These gates do not block independent source implementation and fixture tests. Next: native shell and M2 authorized chore/operation-receipt architecture proof.

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## M2 — Effect / AI SDK compatibility boundary (feature branch)

Implemented `codex/ai-contract-adapter`: `@nest/ai` pins AI SDK 7.0.106 with Effect 4.0.0-rc.115. The schema adapter derives draft-07 JSON Schema and validates the same canonical Effect codec; named references and rejection of excess fields are preserved. The tool adapter forwards the shared executor, cancellation and safe failure codes without adding retries. SDK 7 approval uses `ToolLoopAgent.toolApproval`. No release-age exclusions were retained after choosing the preceding package patch.

Locally verified: nine tests using the actual SDK with its fixture model cover invalid UUID/centime/extra fields, nested references, structured output, command execution, approval pause/resume with command denial, sanitized defects, interruption cleanup and SDK SSE-to-chat transport. TypeScript and lint limits pass. These are compatibility tests, not live-model, durable approval, authenticated API or native evidence. No model request or spend occurred. CI pending PR creation.

### Milestone checklist

- [ ] M0/M1: delivery/native preview in PRs #1/#2; native build/install and owner/device UX review remain.
- [ ] M2: session adapter #3, chore receipts #4, SQLite journal #6 and this SDK boundary are foundations. Authenticated native vertical flow, durable private conversations/approvals and live provider/Expo streaming remain incomplete.
- [ ] M3–M5: identity/settings, daily-use vertical flows and Meals remain incomplete.
- [ ] M6: Calendar boundary #7 has successful push CI; PR CI was still running at the last check. Server sharing and device privacy journeys remain.
- [ ] M7: pure CHF domain #5 exists; financial transactions, approvals, recurring automation and UI remain incomplete.
- [ ] M8/M9: push, migration rehearsal, device acceptance and release preparation remain incomplete.

No PR is merged. Greptile has not returned a review for any requested commit. A read-only GitHub installation lookup was rejected with HTTP 403 because the available token is not a GitHub App user token; installation/configuration cannot be verified with that credential. Owner needs to verify Greptile repository access/settings for drrius/nest if reviews remain absent. No alternate review substitutes for the explicit gate. Native execution still needs a physical iPhone development installation or available simulator service. Removed continuation automation remains absent; no purchases, production migration or publication has occurred.

## 20 September — AI adapter review correction

Raised the root Node floor to 24 to match CI and native TypeScript test imports, addressing Greptile's runtime compatibility finding. The nine SDK adapter fixture tests pass locally. Real provider, server approval persistence and native streaming integration remain outstanding; this correction does not change those verification gaps.

## M6 — device availability privacy boundary (feature branch)

Implemented `codex/calendar-availability`: exact Expo Calendar 57.0.4 read adapter, Effect CalendarReader and a text-free busy-interval projection. Read permission is checked before/after capture. No selected calendars, restricted/missing calendars, failed fetches, malformed dates and revocation yield unknown. Free/canceled events are excluded; all-day absolute boundaries, detached occurrences and coverage/freshness are explicit. No native writes or network publisher exists.

Locally verified: 10 focused examples/service fixtures and 1,000 deterministic property cases for merged interval equivalence, clipping, ordering and duplication. TypeScript, formatting and lint limits pass. Expo config introspection confirms Calendar/full-read explanations and no Reminders usage-description keys. This is generated-config evidence, not a native permission test. CI pending PR creation; device verification absent.

### Milestone checklist and blockers

- [ ] M0/M1: delivery/shell PRs #1/#2 remain open. Native build/install, owner interaction/accessibility review and simulator access remain outstanding.
- [ ] M2: PRs #3/#4/#6 cover session authorization, chore receipts and the SQLite journal. #6 now has passing current-commit CI. Live native auth/replay and AI approval/streaming proof remain incomplete.
- [ ] M3–M5: onboarding, real daily flows and Meals remain incomplete.
- [ ] M6: this boundary is implemented locally; agenda UI, consent storage, atomic server snapshots/RLS, opt-out races and real two-device Calendar privacy verification remain.
- [ ] M7: CHF domain PR #5 is open; money services/UI and recurring approvals remain incomplete.
- [ ] M8/M9: real push, migration rehearsal and release journeys remain incomplete.

PRs #1–#6 have passing CI but no Greptile review response; none is merged. Exact merge blocker: Greptile must review each current commit explicitly and report no outstanding findings. Owner may need to enable/fix Greptile's drrius/nest repository access. Exact native blocker: Linux has no Xcode; EAS simulator availability returned false, and no physical iPhone development install is verified. Calendar 57 additionally requires a development build, not Expo Go. Independent work continues; no purchases, production migration or publication has occurred. Removed continuation automation remains absent.

## M2 — SQLite journal foundation (feature branch)

Implemented `codex/offline-outbox`: exact pinned Expo SQLite 57.0.3, its exclusive transaction adapter, Effect `OfflineStore`, account/household-scoped canonical state and two-action outbox. Durable intent overlays, immutable attempted payloads, predecessor receipt versions, acknowledgment rollback, conflict preservation and session-lease invalidation are implemented. Logout suspends access and retains pending work for the same identity; it does not silently discard it. No UI or network replay is wired on this independent branch.

Locally verified: 12 focused file-backed SQLite tests cover reopen, lost acknowledgment, no-op version sequencing, conflicting intents, changed-operation rejection, forbidden offline money/AI actions, actor/household isolation, rollback on storage failure, malformed snapshot rejection and canonical chore payloads. TypeScript, configured lint limits and formatting pass. Effect's async advisories remain on the SQLite Promise adapter/repository callbacks and Node tests; no lint limits are disabled. CI verification pending PR creation; native SQLite/device verification not performed.

### Milestone checklist

- [ ] M0: delivery/build decisions are in PR #1; native shell/build preparation is in PR #2. Physical iPhone build/install and simulator access remain unverified.
- [ ] M1: Quiet development preview is in PR #2; owner/device accessibility and interaction review remain.
- [ ] M2: authenticated session adapter (#3), transactional chore receipts (#4) and this journal are independent foundations. Still required: auth/session storage integration, server command wiring, native replay, conflict recovery, bounded retention, AI streaming/tools and approval proof.
- [ ] M3–M6: onboarding, real daily flows, Meals and Calendar remain incomplete.
- [ ] M7: pure CHF allocation/ledger properties are in PR #5; financial services, approvals and UI remain incomplete.
- [ ] M8–M9: real push, full migration rehearsal, device journeys and release candidate remain incomplete.

All five earlier PRs have successful current-commit CI, but no Greptile review was returned at the latest check. None is merged. Required review approval cannot be inferred from silence; owner may need to enable/fix Greptile access for drrius/nest. Independent work continues. EAS simulator availability was explicitly false; a real iPhone/development installation or authorized simulator access is needed for native evidence. No production migrations, purchases or releases have run. The continuation automation was removed at the owner's request and has not been recreated.

## 20 September — offline review correction

Greptile found that shape-only date checks admitted impossible chore completion dates. The input schema now requires a real Gregorian date in years 0001–9999. A SQLite regression rejects invalid months/days, non-leap February 29 and year zero without leaving a queued operation, and verifies a valid leap day survives prepare. The Node floor also matches CI at 24. Native integration and device restart/conflict verification remain outstanding.

## 20 September — domain review correction

Raised the root Node engine floor to 24 after Greptile identified that early Node 22 releases cannot run the direct TypeScript-importing tests. This matches CI. Financial domain behavior is unchanged; the six domain tests, including four 1,000-case properties, pass on the local runtime. CI and updated-commit review remain required.

## 20 September — chore receipt review corrections

Removed the receipt-to-current-membership foreign key: durable receipts must not prevent access revocation or be deleted to remove a member. Commands now lock current membership before receipt replay or completion; RLS still requires current membership. Added a database regression proving membership removal succeeds, receipts remain, and subsequent reads/replays are denied.

Completed occurrences now validate the expected due date before returning `already_completed`. A stale partner request conflicts without storing a receipt; an unchanged compatible request retains the original completer. These address both Greptile findings. Full audited legacy-schema compatibility remains a separate gate.

## 20 September — identity review corrections

Greptile identified malformed successful Auth responses being classified as invalid sessions. They now return `unavailable` (503), consistent with malformed membership responses; expired credentials and anonymous users still return 401. Added malformed Auth data to the HTTP regression cases. Raised the supported Node floor to 24, matching CI and the native TypeScript-loading test commands. These changes address both review findings; native session integration is still pending.

## Feature branch evidence

- [PR #2](https://github.com/drrius/nest/pull/2), `a96d964`: native preview shell, generated artwork, development-only route guards, four stacks, shared grocery state, chore completion and single-dinner replacement in fictional data. Formatting, lint, TypeScript 7, tooling-contract tests and iOS Metro export pass; current-commit CI passes. Not device-verified, not connected to backend/auth/AI, not a completed M1.
- [PR #3](https://github.com/drrius/nest/pull/3), `6682c72`: Effect v4 bearer identity and user-scoped current membership handler. Ten HTTP fixture tests pass, including concurrent handler reuse, revocation, invalid identity, outsider rejection, redirect refusal and safe errors. API source lint/typecheck pass. Not deployed, not wired to native, and not database/RLS verification.
- Greptile review requested once per current feature commit; no responses observed yet. Do not merge on silence. No PR merged.
- Local Docker access is denied even with elevated execution. Investigate standalone fixture PostgreSQL for transactional/RLS tests. Sandbox HTTP fixture run stalled; explicitly permitted loopback run passes. No production data accessed.

## 20 September — delivery-contract review

Greptile is now enabled and reviewing the open PRs. Its PR #1 finding was valid: the finite action inventory omitted choosing a favorite in a meal proposal. Added `mealProposals.chooseFavorite` as a private proposal edit that selects an existing saved meal for one slot, preserves other slots and still requires explicit proposal approval before changing the household plan. Verified against the approved brief's AI proposal row; formatting passes. Implementation remains outstanding.

The owner authorizes an adversarial review subagent if Greptile fails or hits a rate limit, with fixes and rereview until signoff. This does not waive CI or unresolved findings. The removed automation stays removed.

## 20 September — integration status

PR #1 merged as `7f1b06a` after latest-commit CI passed, Greptile rereview reported zero new comments, and its addressed conversation was resolved. PR #2 now incorporates that main commit; its only conflict was this progress document, resolved by retaining both evidence sections. No native source changed in this integration update. Earlier dated “no PR merged” and “no review response” entries are historical observations.

PR #2 initial Greptile review completed; the updated integration commit requires a fresh review and CI before merge. Native execution and real backend behavior remain unverified. Other open PRs are undergoing fixes and rereviews; no production migration or deployment has run.

## 20 September — identity and native shell integration

PRs #1 and #2 are merged. This branch integrates their delivery contract and native preview with the bearer identity API; the only manual conflict was progress documentation, with both evidence sections retained. Dependency lockfile merged automatically and is verified through frozen installation. The API remains unconnected to the native session/UI, so this is integration preparation rather than a complete M2 journey. Current combined commit CI and Greptile review remain required before merge.

## 20 September — chore integration and verification correction

Integrated merged PRs #1–#3, retaining both API and database CI commands and both progress histories. Updated the database README from ten to twelve tests to include the two review regressions; the earlier count was stale. This remains a synthetic legacy closure, not verification of the full recurrence engine. Native/API command wiring remains next after the reviewed foundations merge.

## 20 September — calendar/native integration

Integrated merged PRs #1–#4. Preserved the native shell's development bundle/EAS identity, artwork and SecureStore settings, while adding the read-only calendar plugin with reminders permission disabled. Reconciled exact dependencies and kept calendar, API and database CI checks. Real EventKit permissions, native calendar selection and server publishing remain unwired/unverified; interval and service tests do not substitute for device evidence.

Verification after integration: frozen install, combined typechecks, lint/format and eleven calendar tests pass (ten examples plus the 1,000-case interval property). Expo introspection retains `ch.drrius.nest.dev`, iPhone-only targeting, the intended calendar permission text and no reminders permission keys. This is configuration evidence, not EventKit/device execution.

## 20 September — offline/native integration

Integrated merged PRs #1–#4 into the offline branch. Kept the native shell's isolated development identity/EAS settings and SecureStore plugin while adding SQLite; preserved exact dependency pins from both branches. CI retains API, chore database and offline checks. The local SQLite queue is still not wired to native session lifecycle or the chore API, so an end-to-end offline journey remains incomplete.

## 20 September — financial rules integration

PR #4 merged after current-commit CI, a zero-comment Greptile rereview and all addressed conversations resolved. This branch integrates PRs #1–#4 with the pure CHF rules. CI runs package tests once through `pnpm test` (including both API and domain) plus isolated database tests; the focused `test:domain` command remains available locally. Progress histories are retained. These rules remain unconnected to actual financial posting and native Money UI.

## 20 September — shared AI adapter integration

Integrated merged PRs #1–#5 into the AI adapter branch. CI runs API, domain and SDK package tests once through the recursive test command and retains database/tooling checks. Kept exact AI SDK 7.0.106 and Effect pins. This prepares shared authorized command wiring; real provider streaming, native chat and durable approval integration are still incomplete.

## 20 September — AI compiler diagnostics correction

Investigated Greptile's compiler finding. The package's actual compiler reports `7.0.2+effect-tsgo.0.45.0`, so root patching was working; however its tsconfig lacked the Effect language-service plugin. A temporary floating-Effect probe incorrectly exited 0 before the fix and exits 1 with TS377001 `effect(floatingEffect)` afterward. Added the plugin/schema configuration and a regression exercising the package compiler. Real source typechecks without suppressions. Root Oxlint diagnostics were already enabled, but they did not substitute for the missing compiler configuration.
Offline integration follow-up: PR #5 is now merged. Retained both domain and offline scripts/evidence when updating this branch to current main; no queue behavior changed. Current commit still requires its own CI and clean review.

Calendar integration follow-up: PRs #5 and #6 are merged. This update retains calendar, SecureStore and SQLite plugins together, and preserves domain/offline/calendar test commands. No calendar projection behavior changed. Native EventKit and SQLite execution are still unverified on device.

AI integration follow-up: PRs #6 and #7 are now merged. Preserved calendar/offline checks alongside the AI adapter and compiler regression. This integration requires new CI and Greptile review; native and live-provider integration remain incomplete.
