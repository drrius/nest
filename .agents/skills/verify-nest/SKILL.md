---
name: verify-nest
description: Build, launch and drive Nest's SwiftUI iPhone app in an owned iOS simulator on the authorized Mac over SSH, from this Linux checkout. Capture screenshots, accessibility snapshots and app-data evidence. Use when you need proof that a change works in the real app (not just swift test or CI), when asked to run, screenshot or click through Nest, or when checking a feature against the verification map in features/.
---

# Verify Nest in the simulator

Nest's user surface is the SwiftUI iPhone app in `apps/ios`. It talks to the hosted Nest API and Supabase. This checkout is on Linux. Xcode, simulators and signing exist only on the owner's authorized Mac, which is reachable over SSH on Tailscale. Everything here runs from the Linux checkout root through one helper:

```sh
V=.agents/skills/verify-nest/scripts/nest-verify
```

`$V` with no arguments prints its commands. Each run gets its own simulator named `Nest Verify <run>`, its own DerivedData, its own agent-device daemon and session, and a Mac scratch directory `/private/tmp/nest-verify-<run>/`. Two runs can therefore go side by side. Evidence ends up in `evidence/verify-nest/<run>/` in this checkout. Git ignores that path, and cleanup never removes it.

Read [features/README.md](features/README.md) before driving anything. It holds the baseline preconditions, driving conventions, proof standards and one recipe per feature.

## What you can reach

- **Signed out (always).** A fresh owned simulator has no Apple Account and no Nest session. It reaches the sign-in screen, Apple's sign-in alert, the failure message and the empty offline store. See [features/sign-in.md](features/sign-in.md).
- **Signed in (synthetic household).** Run `$V signin "$RUN" member` to sign in as Test Alex, or `partner` for Test Sam. Afterwards the app opens on the four tabs. Both are `example.invalid` accounts, and `Nest verification household` holds only the two of them. It lives on the permanent `nest` backend, separate from the owner's real household. This is the default for every signed-in recipe, and it needs no owner input.
- **Writes in the synthetic household.** Saving, completing, posting and approving there are allowed when the change under test needs them. These writes are permanent: Money history is append-only. Prefix every title or description you create with the run id, use CHF amounts of 1.00 or less, and never repeat a financial action because a wait timed out.
- **Shared household.** Concurrent runs share it, so don't assume empty lists. Assert on your own run-prefixed items.
- **AI.** AI planning and the assistant spend the owner's AI Gateway budget. Use them only when the change under test touches AI.
- **The owner's real household is off limits.** Never sign in as the owner, use their Apple Account, or edit the database to make a path reachable.

## Launch

```sh
RUN=$($V new)               # e.g. 20261010-121615-5ace
$V launch "$RUN"            # about 2 min. Allow 15 for a slow first build.
```

`launch` does six things. It records the local `HEAD` and a digest of the exact `apps/ios` tree, including uncommitted and untracked files. It creates and boots an iPhone 17 Pro simulator on iOS 26.3. It streams the tree to the Mac. It builds the `Nest` scheme, Debug, ad hoc signed, against the public test config `~/Nest/nest-local.xcconfig`. It installs the app. Finally it opens the app in agent-device session `nest-verify-<run>`.

It is ready when the last line reads `READY run=<run> sim=<udid>`. A build failure exits `4` and prints the compiler errors. The full log is `evidence/build.log` on the Mac, and it survives cleanup. Run the tool call in the background or with a long timeout.

Options:

- `NEST_MAC=user@host`: a different SSH target. The default is `dariussibarium@dariuss-macbook-pro.tail2aa91d.ts.net`.
- `NEST_VERIFY_XCCONFIG`, `NEST_VERIFY_DEVICE_TYPE`, `NEST_VERIFY_RUNTIME`: a Mac-side xcconfig path, a simctl device type id or a runtime id. They are forwarded to the Mac.
- `--sim <udid>` adopts an existing simulator instead of creating one, for example one the owner signed in on. The simulator must be `Shutdown`. Adopting it replaces its installed Nest binary but keeps its data. Cleanup terminates the app and shuts the simulator down, but never deletes it.

The run id is single-use. To build a newer tree, clean up and launch a new run.

## Doctor

```sh
$V doctor "$RUN"
```

The doctor is read-only. It prints `ok` or `FAIL` for each of these checks:

- The simulator exists, is booted and is the one this run created.
- Nest is installed, and the installed binary is byte-identical to this run's build.
- Push is disabled.
- The app process is running.
- The run's agent-device session is open.
- The build still matches the local `apps/ios` tree.

The `cfg` lines show the bundled API and Supabase origins. They must be `https://nest-test-api-drrius-projects.vercel.app` and `https://tkjixmujjoustdiedfmw.supabase.co`. Run the doctor first whenever anything looks off. Here is how to read the failures:

- **`build is stale`.** You edited `apps/ios` after launch. Clean up and launch a new run.
- **`app process is running` fails.** The app crashed or was closed. Run `$V ad "$RUN" open ch.drrius.nest`, and keep the crash in mind as a finding.
- **`agent-device session is open` fails.** The daemon idled out. The run asks for a 30-minute idle timeout. Run `$V ad "$RUN" open ch.drrius.nest`.
- **`no run <id>`.** The run was never launched, or it was cleaned up already.

## Sign in

```sh
$V signin "$RUN" member      # Test Alex. Use partner for Test Sam. Under a minute after launch.
```

`signin` does five things:

1. It builds the test bundle for this run with `build-for-testing`.
2. It copies the Mac's verification credentials into the run for the length of one test.
3. It runs `NestAppTests/FictionalAccountSessionFixtureTests` on this run's simulator only. The test signs in with the account's password, checks `/v1/session` for the expected member and household, and saves the session in the app's Keychain.
4. It deletes the copied credentials.
5. It relaunches the app. The run is signed in when the last line reads `SIGNED-IN run=<run> role=<role>`.

A fresh simulator then shows the first-use sheet. `Get started` dismisses it, and that choice is saved on the device only. Switching roles on the same simulator works: run `signin` again with the other role. The fixture refuses a simulator whose saved session belongs to anyone other than the two verification accounts.

The credentials live only on the Mac, in `~/Library/Application Support/nest-verify/accounts.json` with mode 600. They are never printed, committed or put in evidence. `$V accounts` creates or refreshes the household and both users through the Supabase admin API. It reads the server key from `~/Nest/supabase-secret.txt`, writes the credentials file, and proves that each account signs in and that `/v1/session` returns it as a member. It is safe to rerun: existing users and the household are reused, and passwords change only when the credentials file is missing. It refuses to continue if the household contains anyone else. You only need it if `signin` reports that no accounts exist. Never delete the household or its users during a run. Removing them takes an owner-approved, guarded deletion like `tools/maintenance/remove-fictional-household.sql`.

## Drive

```sh
$V ad "$RUN" snapshot -i                                  # accessibility tree with @e refs
$V ad "$RUN" press 'label="Sign in with Apple"' --settle  # act and print the UI diff
$V ad "$RUN" wait text "A little less to remember."       # assert visible text
$V ad "$RUN" wait absent 'label="Some message"'           # assert disappearance
$V ad "$RUN" open ch.drrius.nest --relaunch               # cold relaunch, same simulator
$V ad "$RUN" help workflow                                # the driver's full reference
```

`ad` runs the pinned agent-device `0.21.15` on the Mac with the run's session. It adds `--platform ios --udid <sim>` to `open`. It runs from the Mac evidence directory, so `screenshot name.png` lands in the evidence. It also appends the command and its output to `drive.log`.

Use selectors such as `label="Meals"`, `id="tab-header-meals"` and `role=button label="Save"`, or the `@e` refs from the latest snapshot. Do not use coordinates. System alerts, such as Apple's sign-in alert, appear in snapshots. `alert` reads one, and `alert accept` or `alert dismiss` answers it. The handles for each tab are in the feature files.

`xcrun simctl` work, such as calendar privacy grants, runs on the Mac against the doctor's `sim` UDID. Target that UDID only.

## Evidence

```sh
$V ad "$RUN" screenshot today.png             # driver screenshot into the run's evidence
$V shot "$RUN" apple-alert                    # simctl screenshot, system UI included
$V ad "$RUN" snapshot > evidence/verify-nest/$RUN/today.snapshot.txt
$V data "$RUN" after-save                     # data container listing and offline SQLite row counts
$V pull "$RUN"                                # copy Mac evidence to evidence/verify-nest/$RUN/
```

A proof meets these standards:

- **Real user path.** Drive the shipping app through its UI. Do not use test-only hooks, injected sessions or database edits. There are no mocks. The app talks to the hosted backend.
- **Action and result.** `drive.log` records every action with its diff. Capture the state before and after, not only the final screen.
- **Side effects.** For local effects, run `$V data` before and after. The offline journal rows show whether a change was queued or synced. For backend effects, take a second read in the app: reopen, refresh or relaunch. Without the owner's go-ahead for a mutation, stop at the review step and say so.
- **Identity.** `run.env` in the evidence records the source commit, the tree digest and the simulator. Quote them with the result.
- **Scope.** Simulator evidence is not phone, push, real-calendar, live-AI or two-phone acceptance. Report it separately, as `AGENTS.md` and `docs/progress.md` require.

## Cleanup

```sh
$V cleanup "$RUN"
$V list                    # expect: no run directories, no Nest Verify simulators, no run daemons
```

Cleanup works in this order:

1. It pulls the evidence first.
2. It closes the run's agent-device session and stops the daemon bound to the run's state directory.
3. It shuts down and deletes the simulator, but only if it is named `Nest Verify <run>`. An adopted simulator is shut down and kept.
4. It removes `/private/tmp/nest-verify-<run>/`.
5. It lists the evidence that remains.

Run cleanup after failed launches too. A run that has no recorded simulator still has its partial scratch directory removed. Afterwards, confirm `evidence/verify-nest/<run>/` still has your artifacts.

Shared caches under `~/Library/Caches/nest-verify/` on the Mac stay in place: the pinned agent-device install, Swift packages and the runner build. They are not run state.

Never kill processes by name, and never delete or drive simulators you did not create. The Mac also holds older QA simulators with preserved sessions and journals, such as `Nest Smallest QA`, `Nest partner QA` and `Nest UI Review`. Another tool's device panel may hold a booted simulator. Leave them alone. For a stray `Nest Verify <run>` simulator that `list` shows, run `$V cleanup <run>` with that run id.

## Related surfaces

- **XCUITest.** `apps/ios/UITests` holds repeatable signed-in journeys in the `NestAccessibility` scheme. They need the deleted fixture accounts and the exact owned simulators. Read `apps/ios/UITests/README.md` before running any of them.
- **Backend.** The TypeScript API in `apps/api` and the domain packages are verified through `pnpm` tests, not this skill. Database and integration suites need PostgreSQL and PostgREST, as `README.md` describes.
