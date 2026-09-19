# Nest: native rewrite

Planning checkpoint: 19 September 2026. The owner authorized implementation in this separate greenfield Nest repository. The prior same-repository recommendation is superseded. Infrastructure purchases and production release/cutover remain gated.

The objective is to reduce the mental effort of running a two-person household. This is a fresh iPhone product, not a screen-for-screen port of the web app.

Read in this order:

1. [Product and design brief](product-and-design.md): agreed scope, screen structure, interaction design, and boundaries.
2. [Architecture audit](architecture-audit.md): repository findings, reuse decisions, infrastructure alternatives, and recommended technical design.
3. [Implementation plan](implementation-plan.md): ordered milestones, acceptance criteria, migration, and release gates.

## Status and authority

- **Confirmed:** the product decisions in the brief, including scoped offline support, automatic fixed recurring expenses after setup approval, calorie-guided meal suggestions, and the CHF 20/month infrastructure ceiling.
- **Recommended:** architecture, exact presentation details, milestones, and operational defaults. These are implementation proposals, not claims of shipped behavior.
- **Design approved:** Quiet, selected from three interactive HTML directions on 19 September 2026. See the [prototype](prototypes/index.html).
- **Not done:** new application code, migrations, service provisioning, data migration, native runtime verification, or release.

The audit baseline is local `main` at `4a528c96caf41515a70291ccecbba9d7b35e3349`, which includes startup-fix PR #98. This baseline refers to the legacy reference repository, not this new Git history. Findings come from source inspection and current official documentation; no production household records were read for this audit.

These decisions supersede conflicting older scope only for the new native product. The old product, historical ADRs, and migrations remain intact. Record the confirmed changes in a new ADR; the new root agent contract already follows the Nest scope so later work cannot accidentally reinstate the old online-only, draft-only, or five-tab constraints.

## Recommended direction

Build a new Expo interface with Today, Meals, Calendar, and Money. Retain Supabase Postgres/Auth and tested domain rules; redesign client data access and the API around authenticated native requests. Use device calendars for read-only calendar views, a small SQLite outbox for the explicitly supported offline actions, and one server command layer for UI and AI actions.

The confirmed architecture uses **Effect v4** across application/service layers and **Vercel AI SDK** for model calls, chat streaming and tool orchestration. Thin tool adapters invoke the same Effect commands as native UI actions. Prove schema integration, cancellation and durable approvals early. Effect AI is not part of the selected stack; hosting is a separate choice.

Prove the difficult parts early: native calendar access, authenticated AI streaming and approval, offline retries, and a real release build on a phone. A successful bundle or simulator build does not satisfy those gates.
