# Nest verification map

This directory is the maintained source for verifying Nest's user-facing behavior in the SwiftUI iPhone app. Read this index before driving the app, then use the matching feature file as the recipe. Every command below runs from the Linux checkout root. `nest-verify` stands for `.agents/skills/verify-nest/scripts/nest-verify`.

## Baseline preconditions

- `nest-verify launch $RUN` has printed `READY run=$RUN sim=<udid>` for a run id from `nest-verify new`.
- `nest-verify doctor $RUN` shows no `FAIL` lines, and its `cfg` lines name the hosted Nest origins with `NEST_PUSH_ENABLED=false`.
- A fresh owned simulator has no account. It reaches only the signed-out screen. That makes [Launch and sign-in](./sign-in.md) the only feature you can drive without help.
- Every other feature needs a signed-in, linked household member on the run's simulator. Today that means the owner signs in with Apple on that simulator. Their real household is on the permanent `nest` backend. The synthetic fixture accounts were deleted on 10 October 2026. Do not recreate them or sign in on the owner's behalf. Without a signed-in member, report the feature as unreachable and name this precondition.
- Never drive a simulator that this run did not create or explicitly adopt with `--sim`.

## Driving conventions

- Drive through `nest-verify ad $RUN <agent-device args>`. The wrapper pins the run's session and simulator. It runs from the run's Mac evidence directory, so relative screenshot paths land in the evidence.
- Start each recipe with `nest-verify ad $RUN snapshot -i`. Act on the printed `@e` refs or on selectors.
- Selectors look like `label="Meals"`, `id="tab-header-meals"` or `role=button label="Save"`. Prefer the identifiers listed in a feature file over visible text.
- Use `--settle` on `press`, `fill` and `scroll`, then read the diff. Use `wait text "..."` for results that depend on the network. Do not use fixed sleeps.
- Many labels are shared. The Today stack can contain a second Meals or Calendar header after `Open meal plan` or `Open Calendar`. Narrow an `AMBIGUOUS_MATCH` with `role=` or with a ref from the latest snapshot.
- Mutations hit the permanent backend once a member is signed in. Take only the mutations the owner authorized for this run. Never retry a financial action because its UI observation failed. Read the state again instead.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen. `drive.log` in the evidence records every `ad` command and its output.
- UI proof includes an accessibility snapshot, saved with `nest-verify ad $RUN snapshot > <local path>`, and a screenshot: `nest-verify ad $RUN screenshot <name>.png` or `nest-verify shot $RUN <name>`.
- Mutation proof includes a second, read-only view of the stored value. Examples: reopen the screen, pull to refresh, or relaunch with `nest-verify ad $RUN open ch.drrius.nest --relaunch`.
- Record the feature ID and the entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition. Do not report a skipped entry point as verified through a different path.
- Simulator proof is not phone, push, Calendar-on-device or live-AI acceptance. Record it separately, as `AGENTS.md` and `docs/progress.md` require.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with nest-verify` starts with `Preconditions:` and uses labeled bullets. Each bullet pairs a user action with an exact command and an observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands and observable proof.

## Features

- [Launch and sign-in](./sign-in.md) covers a fresh install, the signed-out screen, Apple's sign-in sheet and the account states. It can be driven without an account.
- [Today](./today.md) covers chores, groceries, today's meals, bills to confirm, proposals and the add menu. Needs a signed-in member.
- [Meals](./meals.md) covers the week plan, adding, replacing, moving and removing meals, leftovers, ingredients and AI planning. Needs a signed-in member.
- [Calendar](./calendar.md) covers calendar access, choosing calendars, day selection, household layers and busy sharing. Needs a signed-in member.
- [Money](./money.md) covers the balance, expenses, payments, history, bills and financial approvals. Needs a signed-in member and a linked partner.

Not yet mapped: the header's Assistant (`Private conversations`, `Ask Nest`), Profile (preferences, notifications, Diagnostics, sign-out), the first-use setup sheet and Renewals. Add a file here before claiming verification of those paths.
