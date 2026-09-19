# Nest agent contract

Read docs/native-rewrite/product-and-design.md, architecture-audit.md and implementation-plan.md before implementation. The confirmed new native scope is authoritative; historical descriptions of Household OS in the audit are reference material, not Nest requirements.

- Build an iPhone-only Expo app with Today, Meals, Calendar and Money using the approved Quiet design. Product name: Nest. Generate new artwork with image generation.
- Effect v4 for contracts/services/domain orchestration; Vercel AI SDK for AI streaming/tools. All user actions have shared authorized commands and corresponding AI tools or honest device handoffs.
- Follow the brief's financial approvals, meal-plan approvals, private AI and calendar privacy rules. Financial history is append-only; CHF integer centimes only, balances derived. Household work stays separate from financial obligations.
- Enforce tenant isolation and test RLS. Authenticate/authorize sensitive mutations. No server secrets in clients.
- Offline support is limited to the confirmed brief. No trips/shared-event creation, macro tracking, banking or payment processing.
- Pin exact dependencies and commit pnpm-lock.yaml. TypeScript 7 with @effect/tsgo; Oxlint/Oxfmt. Never bypass the 400-line file, 80-code-line function, or complexity-10 limits to finish a feature.
- Routes belong in apps/mobile/src/app; screen bodies, components and services are siblings. Use pure shared domain rules without React or database dependencies.
- Run only focused meaningful verification. New domain invariants require property/database tests. Report actual native verification separately from bundles/typechecks.
- Read the old repository only as a reference/migration source. Copy deliberately audited code and tests, not whole legacy screens or infrastructure defaults. Keep existing data safe; new production migrations remain gated.
- Do not buy services, migrate/cut over production, merge, or publish releases without explicit authorization. CHF20/month is a ceiling, not a target; purchases need approval.
- Keep docs/progress.md current with implemented slices, verification and blockers. Do not let unavailable device services block independent local work.
