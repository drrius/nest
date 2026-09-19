# ADR 0001: Native scope and delivery contract

Accepted 19 September 2026. Authority: the confirmed product brief and owner's end-to-end implementation instruction. Historical Household OS ADRs are reference material and remain untouched.

## Decision

Build Nest in this greenfield repository: iPhone-only Expo with Today, Meals, Calendar and Money, using Quiet. Keep the two existing equal members and Apple identity path. Deliberately audit legacy code/tests before selective reuse; preserve IDs, relationships, receipts and all financial history. The legacy application remains unchanged until an approved cutover.

Use Effect v4 Schema and request-scoped Context/Layer services for native application orchestration and API commands. Vercel AI SDK owns model execution, streaming and chat state. UI and finite AI tools invoke the same authorized commands; device permissions, calendar selection and receipt picking use acknowledged device handoffs. Canonical command schemas must not be duplicated in another schema library.

Use exact pinned packages, TypeScript 7 with Effect tsgo diagnostics/native language server, Oxlint/Oxfmt and the repository's file/function/complexity gates. Native routes live in `apps/mobile/src/app`; screen bodies and services are siblings. Pure domain rules have no React/database dependencies.

## Product invariants

- Offline: view previously loaded information, durably complete chores and check/uncheck groceries only. Queue no money or AI writes. Account-bound snapshots/outbox must survive restart and expose conflicting intent.
- Money: integer CHF centimes, derived balances, append-only entries/corrections. AI financial writes require server-validated exact-payload approval. Explicit fixed-rule mandates authorize future obligation postings; variable amounts require entry/confirmation. Legacy rules remain drafts until opted in. No banking or payment processing.
- Meals: Monday–Sunday, configurable breakfast/lunch/dinner, saved and one-off meals. AI generation proposes; approval binds exact revision and slot versions. Grocery ingredient review is separate and idempotent. Honor dietary constraints; optional calorie goals are private estimates for planning, never nutrition tracking.
- Privacy: private owner-only chats/memory/calorie goals. Memory requires explicit consent. Device calendar details remain local; opted-in sanitized busy snapshots carry freshness/range and clear on revocation. No shared-event/trip creation or EventKit writes.
- Household work is separate from financial obligations. Shared work is never auto-assigned; explicit responsibility transfers require acceptance. Checking groceries never posts an expense.
- Notifications: one configurable deterministic daily summary per member; reminder recipients' preferences prevail. No personal calendar text in partner payloads or notifications.
- New artwork uses image generation; functional icons use native symbols. No excluded legacy features, new identity providers or role hierarchy.

## Delivery and operations

Target free infrastructure within verified quotas. CHF 20/month aggregate is a ceiling, excluding Apple membership and AI usage; purchases always require approval. No production data changes, release publication or retirement of the old app without separate owner approval. Fixture migration tooling is authorized; production migration is not. CI must never couple a merge to deployment/migration/publication.

Small feature PRs target `drrius/nest`. The owner's later instruction supersedes the earlier no-merge rule: squash merge only after latest-commit required CI passes, Greptile explicitly reviews that commit with no outstanding/new findings, and all review conversations are resolved. Fix valid findings, explain disagreements with evidence, rereview changed commits, and never treat silence as approval. Refresh local main before dependent work; preserve independent progress when external gates block.

## Consequences and evidence

The [action inventory](../native-rewrite/action-inventory.md) defines command policy; each implementation must link its actual service/tool/UI and tests there. The [milestone checklist](../progress.md) distinguishes implementation, local verification, CI and device evidence. M0–M9 exit criteria remain binding; successful compilation/bundling or mocks cannot meet device/integration acceptance. The owner subsequently requested removal of the overnight automation. It is removed; active task work continues. Do not recreate it solely because earlier instructions referenced it.
