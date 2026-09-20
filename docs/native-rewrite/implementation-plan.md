# Implementation plan

Status: proposed execution plan, 19 September 2026. Product scope is confirmed. The owner selected a separate repository at /home/drrius/Work/nest; tooling foundation is complete, application implementation remains next. Read the [brief](product-and-design.md) and [architecture audit](architecture-audit.md) first.

## Delivery contract

Deliver a complete, focused iPhone app with Today, Meals, Calendar and Money. Do not use the old web route count as a completion metric. Each slice must include the UI, real data behavior, corresponding AI actions, permissions, failure handling and appropriate tests.

The owner’s latest 20 September instruction replaces mandatory PR delivery for the rest of this goal: develop and push small feature branches, obtain passing CI and an independent GPT-5.6 Sol medium adversarial review of the exact commit, then merge locally and push main without creating a PR. Fix every valid finding and obtain explicit clean rereview after changes. Do not force-push main; if main advances, integrate it and verify/review the resulting commit before merging. Preserve review evidence and verification in the progress log. Existing PR conversations must still be addressed before merging those PRs. This supersedes the earlier prohibition on direct implementation pushes to main and the mandatory Greptile path for new branches.

This is standing source-merge authorization, not a request for repeated confirmation. Use the normal approval tool path; if automatic approval review rejects an action, report its reason and do not bypass it. Continue independent work while review or CI is unavailable.

Purchases, production migration/cutover, retiring the existing app and TestFlight/App Store publication still require separate explicit approval. Merge workflows must not perform those actions. Make routine reversible implementation decisions autonomously. See [ADR 0001](../adr/0001-native-delivery-contract.md).

Use exact pnpm dependency versions and committed lockfiles. Preserve merged migrations; new invariants receive database/property tests. When using a PR, retain the required `e2e` label for affected workflows/integration. Passing current-head CI remains required for branch delivery. Browser E2E protects the transitional web runtime; add native verification rather than treating browser success as phone coverage.

## Ordered milestones

### M0 — Record decisions and make native verification possible

Dependencies: approved product brief. Ownership: scope docs, ADR, build/test setup and integration metadata.

- Add a new ADR for the confirmed native scope, including offline exceptions, automatic recurring mandates, meal preferences/calorie estimates and budget ceiling. Reconcile conflicting instructions without rewriting historical ADRs.
- Define the first-release action inventory from the brief. Mark each action as online/offline, household/private, immediate/approval, and UI/tool/device-handoff.
- Establish one repeatable development-build installation path on a real iPhone and a simulator/automation path. Recheck current EAS account capabilities and costs; do not assume the earlier limitation has disappeared.
- Preserve the native startup fixes and record build commit/hash, profile and environment. Production/TestFlight must not silently use mock data.
- Establish the native test runner and minimal smoke: cold launch, sign-in gate, navigate tabs, display real authorized data. Use a development account/household fixture, not destructive tests against personal finances.

Exit: a real executable native test route exists, source/build identity is recorded, and environment limitations are explicit. If only simulator UI tests are possible, permission/calendar/push validation remains a separately blocking physical-device gate.

### M1 — Implement the approved Quiet design with realistic interactions

The HTML design comparison is complete: the owner selected Quiet on 19 September 2026. Use it as the native design baseline. Native interaction and accessibility verification remain outstanding.

Dependencies: M0 for phone execution; native design work can begin before device setup finishes. Ownership: native design system and route prototypes.

- Prototype the four-tab shell with independent stacks, profile/settings access and consistent assistant entry.
- Build realistic Today, week planner/proposal, groceries, expense form, Calendar and approval-card examples.
- Establish typography, semantic colors, spacing, controls, keyboard handling, accessibility and motion rules. Prefer verified native controls; avoid rebuilding iOS navigation chrome.
- Exercise one-handed grocery checking, single-tap chore completion, slot replacement, percentage splits and screen dismissal with unsaved input.
- Review light/dark, large text, Reduce Motion, VoiceOver and narrow supported iPhone sizes. Record motion on-device; no placeholder-success buttons in the review prototype.

Exit: the owner can review concrete screens and short interactions and approve the direction before broad implementation. Mock data is visibly identified and cannot count as backend verification. Design review covers usability, not just colors.

### M2 — Prove architecture with one end-to-end slice

Dependencies: M0. Ownership: shared contracts/domain extraction, authenticated API, local persistence and CI.

- Extract an authenticated read and chore-completion command from cookie-bound web services. Pass verified member/client context explicitly all the way through.
- Build native bearer-token handling with membership checks, typed errors and operation receipts. Preserve existing cookie callers during transition with thin adapters.
- Introduce SQLite snapshots/outbox and protected credential storage. Migrate current session storage safely; test logout/account isolation.
- Complete one chore online/offline, kill the app, retry a lost acknowledgment and reconcile a second member's action.
- Establish Effect v4 Schema contracts, Context/Layer services, scoped client/server runtimes and typed failures. Integrate Vercel AI SDK through thin tool adapters; verify the pinned SDK/provider versions and Effect Schema conversion without duplicating command contracts.
- Prove authenticated Vercel AI SDK streaming and one real tool invoking the shared Effect service, plus a test financial approval that cannot be forged or replayed. Exercise pause, durable persistence, reconnect and approved/denied resume; cancellation must not cause duplicated writes.
- Prove structured meal generation and provider compatibility. Use the AI SDK React chat integration with a verified Expo streaming transport. Wire cancellation and safe error mapping across the Effect/Promise boundary, coordinate retry policies, and test versioned conversation persistence.
- Define stable schema/API versions so future app binaries and additive database changes remain compatible.

Exit: focused auth/RLS, property and fault-injection tests pass; one real native journey works. Record the decision to keep narrow custom sync or revisit PowerSync based on evidence. No generic offline database framework should emerge from this spike.

### M3 — Identity, onboarding and settings

Dependencies: M1, M2. Ownership: session, personal profiles, onboarding and preferences.

- Apple sign-in for the existing two members, safe session refresh, nonmember rejection and recovery guidance.
- “Set up everything” and progressive feature setup using the same editable settings forms.
- Per-person food restrictions/dislikes, optional calorie goal/servings, household cooking preferences and visible meal slots.
- Personal versus household authorization policies; private AI memory management and opt-in calendar/notification settings.
- Authentication interruption preserves or safely resumes navigation/forms without showing another user's cached data.

Exit: either partner can start independently, skip optional setup and complete it later. Partner APIs cannot read private chats/memory/calorie goals. Dietary constraints needed for shared meal planning are used only through the agreed planning service, with their use explained in onboarding.

### M4 — Today, chores and simple groceries

Dependencies: M1–M3. Ownership: Today, routine services, checklist services and offline operations.

- Today with Me + shared / Everyone, due and overdue work, meals, reminders and finance confirmations as those slices land.
- Routine creation/editing with common recurrence presets; shared/assigned/alternating responsibility; pause/archive/skip/reschedule. Honor existing recurrence semantics.
- Explicit transfer requests and acceptance for handing over assigned work; no approval workflow for ordinary shared-item changes.
- One-tap completion with subtle haptic feedback. No chore photo/note form.
- New checklist add/edit/remove and check/uncheck commands, optional quantities/categories, no start/finish session screens.
- Durable offline checking/completion and concise conflict recovery. Creation/editing remains online for the first release.
- Implement and test corresponding AI tools alongside each action, not after the UI is finished.

Exit: two clients can check groceries and complete chores through dropped connections and process restarts without duplicate side effects or silently lost conflicting intents. Current/next routine occurrence counts remain correct. Partner updates do not reset in-progress forms.

### M5 — Meals and optional AI week planning

Dependencies: M3, M4, plus M6 busy-interval contract. Manual meal/library work need not wait for live calendar integration.

- Vertical full-week meal board, configurable slots, saved meals, one-off meals and leftovers where supported.
- Recipe detail: servings, ingredients, short instructions and optional link. No nutrition diary, macros or automatic recipe-import product expansion.
- Manual create/select/move/replace/remove actions with version checks and retry identities.
- Structured AI proposals using saved preferences and authorized availability. Respect hard dietary constraints; mark calorie amounts as estimates.
- Replace one proposal meal without disturbing the rest. Approve the exact visible revision atomically against existing week contents.
- Separate ingredient review, exclude pantry items, preserve quantities/units, and add confirmed groceries once.

Exit: a real seven-day plan can be created manually or through AI, edited, approved and turned into a grocery list. Approval failure is recoverable; two users approving/editing cannot silently overwrite each other. Duplicate requests never duplicate a week or its groceries.

### M6 — Read-only Calendar and private availability

Dependencies: M2, M3. Ownership: EventKit adapter, calendar UI and busy-snapshot services.

- Request native calendar access with a clear explanation and show selected calendars available on each device.
- Show personal details only to the owner; show existing shared iCloud events without creating a second calendar database.
- Per-calendar opt-in to share busy intervals with the partner and AI. Publish sanitized atomic snapshots, track freshness/covered range and remove data on opt-out.
- Optional chores and renewals layers remain app-only; no EventKit write calls for them.
- Use availability to warn when timed household work overlaps, without blocking actions. General event creation/editing and trip planning stay out of scope.
- Test missing/restricted work calendars, all-day/free/cancelled events, recurrence exceptions, DST, stale snapshots and permission revocation.

Exit: on two real devices, each sees personal event details locally and only authorized busy blocks remotely. Inspect network payloads/logs for personal text leakage. Unknown availability never appears as confirmed free time. Background limitations are communicated truthfully.

### M7 — Money and approved recurring automation

Dependencies: M2, M3, M4 grocery handoff. Ownership: money UI, services, approval contracts and additive ledger migrations.

- Native balance/history/detail screens; expenses with equal/exact/percentage splits, full/partial settlements and optional receipts.
- Simple correction/refund entry points preserving append-only history and explanatory relationships. Preserve existing opening balance rather than resetting it.
- Grocery expense action with separate receipt total/shared amount; never infer money from checked items.
- Fixed automatic versus variable confirmation rules. Explicit setup/changes authorize future postings; show cadence, payer, split, amount and start date.
- Server-scheduled exactly-once cycles, rule-version validation, pause/cancel races, catch-up policy and manual-entry linkage.
- Migrate legacy recurring rules as draft-only until opted in. Separate legacy pending drafts from new automatic cycles.
- Add financial/recurring AI tools and native approval cards, including amount/split changes invalidating earlier approval.

Exit: focused examples, property tests and database tests establish zero-sum ledger entries, correct centime rounding, stable balances, retry safety and no duplicate scheduled cycles. Financial writes are blocked offline. Existing histories and both members' balances reconcile exactly.

### M8 — Renewals, reminders and native push

Dependencies: M3–M7 item identities and Money/Calendar contracts. Ownership: renewal UI, notification preferences, scheduler/outbox and native delivery.

- Renewal/cancellation dates, optional responsible member and recurring-rule link. No legal/financial action implied by a reminder.
- Common reminder control across supported item types; Me/Both/Partner recipients and recipient mute preferences.
- One daily summary per member at their chosen time. Deterministic content, no routine model spend.
- Device token enrollment, permissions, token rotation/removal, invalid-token handling, delivery receipts, foreground/background and cold-start links.
- Deduplicate reminders and invalidate outdated reminders after item completion/change. Personal calendar reminders must not reveal private details to another member.

Exit: actual push delivery is observed on a physical iPhone for each relevant permission state, not inferred from a successful API response. Correct recipient, preferences, links and stale-item behavior are verified. Scheduled jobs do not depend on either phone running.

### M9 — Migration rehearsal, usability and release

Dependencies: all milestones above. Ownership: integration/migration/release documentation and final fixes.

- Run the migration protocol below on isolated representative data, then rehearse with authorized existing data using bounded reads.
- Execute real member journeys across cold starts, token refresh, week planning, groceries offline, chore races, AI approvals, Calendar privacy and scheduled expenses.
- Remove unused/unsupported tools and UI links, inspect bundle/runtime dependencies, and profile real scrolling/transitions/startup on supported phones.
- Let both members complete the main tasks without coaching. Fix confusing labels and action placement before adding features.
- Verify a release-mode build at the final commit. Prepare the TestFlight release and explicit cutover checklist; do not submit or retire web automatically.

Exit: all release gates below are met and the owner has a concrete release candidate to approve.

## Dependencies and PR sizing

M0 → M2 → M3 establishes the foundation. M1 gates production UI. M4 unlocks offline daily use; M5–M8 build on shared contracts. Calendar/push device spikes belong early even though full implementation comes later. M9 is mandatory integration work, not optional polish.

Split each milestone into reviewable PRs: contract/database changes, the complete native vertical slice, and only then follow-up polish if needed. Keep root metadata, generated database types and global CI in one integration ownership lane. If parallel implementation is later authorized, read `docs/agent-work-protocol.md` and assign actual paths before editing; milestones are not permission to launch agents now.

No calendar-duration estimate is asserted before the M2 technical spike and M1 design review. They determine whether synchronization, native SDK compatibility or device access changes the implementation effort. Report progress by accepted workflows and evidence, not screens created.

## Migration and cutover protocol

1. Inventory versions, row counts and relationships; distinguish active product records from retained legacy history. Do not dump secrets or private household content into reports.
2. Prefer additive changes to the existing database. Preserve identifiers, ledger events, allocations, receipt references and auth-to-member mappings. If a different backend is chosen later, require deterministic ID mapping and a repeatable import before authorizing a switch.
3. Define explicit mappings: active/claimed legacy groceries become unchecked live checklist items with historical claim/session metadata retained; purchased records remain historical. Do not run old finish-shopping commands as a migration shortcut. Surface open sessions in the rehearsal report for reconciliation.
4. Preserve routine schedules/occurrences/completions, meal definitions/templates/plans, recurring rules/drafts, renewals, and existing notification preferences. New opt-ins start disabled; migration cannot grant calendar sharing, AI memory consent or automatic recurring posting.
5. Keep excluded project/trip/inventory/document records and any linked files intact. Their UI absence is not deletion authorization. Do not migrate private iCloud credentials into the native bundle or personal calendar details into shared data.
6. Reconcile counts, foreign keys, every financial event/receipt reference, zero-sum entries and exact per-member balances. Verify stable idempotency identities and storage access. Any discrepancy blocks cutover.
7. Establish a controlled write cutover for incompatible legacy operations. Gate old clients server-side; hiding the old UI does not stop an older installed app from writing. Avoid dual-writing two divergent databases. Drain or reconcile pending native commands against the chosen epoch before accepting new writes.
8. Rollback disables new automatic scheduling and incompatible writes without deleting financial events created since cutover. Never restore an older database image over newly posted financial history. Preserve a compatibility API/read path while deciding whether a correction or forward fix is needed.
9. Retire the old web frontend/CalDAV integration only after owner approval and verification that no active client/tool/automation relies on it. The new API may remain hosted on the same provider without a web UI. No public export/backup feature is introduced by the migration tooling.

## Verification matrix

| Risk                                    | Smallest meaningful proof during implementation                                                           | Release evidence                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Wrong tenant/private data exposure      | Focused RLS/API tests for both members, outsider and anonymous user; owner-only chat/profile/memory cases | Two-member flows and sanitized payload inspection                                       |
| Offline loss or duplicate mutation      | Real SQLite/repository tests with restart, retry, lost acknowledgment and reordered operations            | Two-device airplane-mode journey and reconnection                                       |
| Money corruption                        | Focused allocation/correction/recurrence properties and transactional DB tests                            | Exact migration reconciliation and real UI/API posting in an isolated household         |
| AI approval bypass                      | Tamper, replay, expiry, changed payload and wrong-member tests                                            | Native streamed approval → one authorized command → visible ledger result               |
| Tool/UI drift                           | Action inventory maps UI, tool, shared service and confirmation policy                                    | Every in-scope action works or has an explicit device handoff; excluded modules absent  |
| Meal overwrite/duplicate groceries      | Proposal revision and concurrent approval DB/service tests                                                | Native proposal replacement, approval and separate grocery review                       |
| Calendar privacy/staleness              | Snapshot authorization/generation/expiry tests; no personal metadata in shared contracts                  | Device permissions, real calendars, partner availability and revocation                 |
| Automatic posting errors                | Cycle uniqueness, concurrent scheduler runs, mandate edit/cancel races and catch-up tests                 | Controlled scheduled-cycle run with audit trail                                         |
| Push appears configured but never works | Token/outbox/receipt tests                                                                                | Real device delivery, preference handling and cold-start navigation                     |
| Attractive but unusable UI              | Native interaction tests and failure/recovery checks                                                      | Both members use major workflows without coaching; motion/keyboard/accessibility review |

Run only touched/directly affected tests, scoped lint and typechecks locally. CI runs full required verification. Use native automation for mobile behavior; browser tests do not substitute for EventKit, Keychain, APNs or a release binary. Do not test component props through static markup. A small docs-only planning change needs formatting/link checks, not the application test suite.

## Release gates

- Every agreed first-release workflow is complete across UI, server and AI; no “coming soon” controls hiding necessary work.
- No money or AI mutation is placed in an offline queue. Queued chores/groceries survive restart and cannot cross account boundaries.
- Automatic financial rules have explicit approved mandates; legacy rules have not been silently opted in.
- The app contains no personal calendar metadata in partner/AI payloads; private chats/memories are isolated.
- Current-head required CI and native journeys pass. The final release binary has run on a device; its commit/build ID and test evidence are recorded.
- Data reconciliation is exact, rollback/cutover is rehearsed, and old writers are accounted for.
- Both members accept the core UX. Approved spend is below the aggregate cap; unapproved subscriptions are absent.
- The owner approves TestFlight submission and production cutover separately from implementation completion.

The first implementation work should be M0/M1/M2: a concrete native design plus proof of authentication, offline completion, calendar access and AI approval. Do not spend weeks building forms before discovering that the native runtime path is untested.
