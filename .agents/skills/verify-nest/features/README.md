# Nest verification map

This directory is the maintained source for verifying Nest's user-facing behavior in the SwiftUI iPhone app. Read this index before driving the app, then use the matching feature file as the recipe. Every command below runs from the Linux checkout root in a shell where `V=.agents/skills/verify-nest/scripts/nest-verify` and `RUN=<run id from $V new>` are set.

## Baseline preconditions

- `$V launch $RUN` has printed `READY run=$RUN sim=<udid>` for a run id from `$V new`.
- `$V doctor $RUN` shows no `FAIL` lines, and its `cfg` lines name the hosted Nest origins with `NEST_PUSH_ENABLED=false`.
- A fresh owned simulator has no account. It reaches only the signed-out screen, which [Launch and sign-in](./sign-in.md) covers.
- Every other feature starts with `$V signin $RUN member`, which signs in as Test Alex. Use `partner` to sign in as Test Sam. Both belong to the synthetic `Nest verification household` and nothing else. The run is signed in once the command prints `SIGNED-IN`. Dismiss the first-use sheet with `$V ad $RUN press 'label="Get started"' --settle`.
- Never sign in as the owner or touch the owner's real household.
- Never drive a simulator that this run did not create or explicitly adopt with `--sim`.

## Driving conventions

- Drive through `$V ad $RUN <agent-device args>`. The wrapper pins the run's session and simulator. It runs from the run's Mac evidence directory, so relative screenshot paths land in the evidence.
- Start each recipe with `$V ad $RUN snapshot -i`. Act on the printed `@e` refs or on selectors.
- Selectors look like `id="tab-header-meals"` or `role=button label="Save"`. Prefer identifiers over visible text. Tab names also appear as headers, so select tabs with `role=button label="Today"`.
- Text fields are named by their placeholder. Fill them by the ref from `$V ad $RUN snapshot -i`, then run `$V ad $RUN keyboard dismiss` before pressing a button the keyboard may cover.
- Use `--settle` on `$V ad $RUN press`, `$V ad $RUN fill` and `$V ad $RUN scroll`, then read the diff. Use `$V ad $RUN wait text "..."` for results that depend on the network. Do not use fixed sleeps.
- Many labels are shared. The Today stack can contain a second Meals or Calendar header after `Open meal plan` or `Open Calendar`. Narrow an `AMBIGUOUS_MATCH` with `role=` or with a ref from the latest snapshot.
- Mutations go to the synthetic household on the permanent backend, and they cannot be undone. Make only the ones the change under test needs. Prefix every title or description you create with the run id. Keep amounts at CHF 1.00 or less. Other runs share the household, so assert on your own prefixed items. Never retry a financial action because its UI observation failed. Read the state again instead.
- AI planning and the assistant spend the owner's AI Gateway budget. Use them only when the change touches AI.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen. `drive.log` in the evidence records every `ad` command and its output.
- UI proof includes an accessibility snapshot, saved with `$V ad $RUN snapshot > <local path>`, and a screenshot: `$V ad $RUN screenshot <name>.png` or `$V shot $RUN <name>`.
- Mutation proof includes a second, read-only view of the stored value. Examples: reopen the screen, pull to refresh, or relaunch with `$V ad $RUN open ch.drrius.nest --relaunch`.
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

- [Launch and sign-in](./sign-in.md) covers a fresh install, the signed-out screen, Apple's sign-in sheet, the account states, and the synthetic sign-in that every other feature starts from.
- [Today](./today.md) covers chores, groceries, today's meals, bills to confirm, proposals and the add menu.
- [Meals](./meals.md) covers the week plan, adding, replacing, moving and removing meals, leftovers, ingredients and AI planning.
- [Calendar](./calendar.md) covers calendar access, choosing calendars, day selection, household layers and busy sharing.
- [Money](./money.md) covers the balance, expenses, payments, history, bills and financial approvals.

Not yet mapped: the header's Assistant (`Private conversations`, `Ask Nest`), Profile (preferences, notifications, Diagnostics, sign-out), the first-use setup sheet and Renewals. Add a file here before claiming verification of those paths.
