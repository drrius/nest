# Native verification record

## Current verification status — 25 September 2026

Native execution remains unavailable here: neither `xcrun` nor `maestro` is on PATH. Running `eas simulator:availability --json` from `apps/mobile` returns `available: false` for `drrius-dev`. No simulator session or build was started. The earlier account result below is historical; it must not be used as current account or quota evidence.

The application has progressed beyond the original preview, but implemented services and local SQLite/HTTP/PostgreSQL tests do not establish native interaction. The preview flow cannot verify authenticated production flows. A separate authenticated Money read flow is now prepared below, but has not run. Real sign-in, offline restart, financial approval, Calendar permissions and push still require a development build with an isolated backend and an available iPhone runner. The existing development and development-simulator profiles remain separate from release submission.

## Original preview scope (historical)

The first native shell is an explicitly labeled M1 interaction preview. No auth, backend, AI, financial posting or offline persistence is implemented by this preview. Production JS denies navigation to the preview routes with `Stack.Protected` and does not show its entry link. This is not a release candidate.

Routes are under `apps/mobile/src/app`. Four native tabs own separate stacks; Today and Meals open the same grocery screen. Preview chore/grocery state is shared across navigation and discarded on process restart. Example meals/calendar/financial history are fictional. There are no simulated successful network calls or enabled financial write controls.

## Environment evidence — 19 September 2026

- EAS project: `@drrius/nest`, ID `b733c351-a149-4b49-b9df-e8c2a14514e2`; Free account. Read-only usage reports 0/15 iOS builds used this billing month. No build or paid session started.
- Development bundle: `ch.drrius.nest.dev`, deliberately separate from legacy `ch.household.os`; iPhone only. No production or submit profile; CI cannot deploy or submit.
- `eas simulator:availability --json` returns `available: false` for `drrius`. Linux has no `xcrun`. Native execution is blocked, not passed.
- The existing overnight automation was removed at the owner's request. The active implementation task continues; do not recreate that automation merely because earlier planning text mentions it.

## Repeatable development route

On a Mac with Xcode and an iOS simulator, from `apps/mobile`, run `pnpm exec expo run:ios`. This creates a local development build; it is not a TestFlight submission. Start Metro with `pnpm exec expo start --dev-client` when reopening the build. Use the generated URL to connect the development client before running smoke commands.

For a physical iPhone, register the device and use the `development` internal-distribution profile after verifying signing access and free quota. No automatic submission is configured. Record source SHA, build ID, profile, OS, device and backend fixture before treating results as evidence. Cloud build success alone does not prove execution. A Mac or an enabled cloud simulator is required for automated iOS interaction from this environment.

## Smoke procedure (prepared; not executed)

Use the installed development build connected to Metro. The Maestro flow at `apps/mobile/.maestro/quiet-preview.yaml` exercises navigation and local preview controls on an iOS simulator. It assumes the app is connected to Metro and the Nest welcome screen is visible; it intentionally does not fabricate Apple authentication. Run `maestro test .maestro/quiet-preview.yaml` from `apps/mobile` on a host with a supported device runner.

Manual additions: cold-start the development client and connect to Metro; check long text, largest Dynamic Type sizes, VoiceOver traversal and checkbox announcements, light/dark contrast, Reduce Motion, one-handed targets, tab stack retention and back gestures. Record video for transitions. The preview adds no custom animation or haptics yet.

Pending real-service smoke: existing-member Apple sign-in, outsider rejection, real authorized reads, session refresh/logout/account isolation, SQLite process restart, two-member conflicts, AI streaming/approval and all calendar/push permission states. Preview results cannot close these gates.

## Authenticated Money read smoke (prepared; not executed)

`apps/mobile/.maestro/authenticated-money-read.yaml` starts on Today with a real member already signed in to an isolated fixture backend. It changes the local chore filter, opens Money, requires an online read, opens a known retained entry and checks its description and amount plus the balance-impact section. It requires an online result on the detail screen as well as the overview and refuses the cached-detail label. It performs no financial mutation. Supply `EXPECTED_ENTRY` as a unique first-page fixture description without regex metacharacters and `EXPECTED_AMOUNT_REGEX` as the anchored event-kind and amount pattern, including the CHF prefix; do not use a wildcard that could match a member allocation. Select a short description that fits the device viewport.

Run from `apps/mobile` on a host with Maestro and a connected iPhone development build: `maestro test -e EXPECTED_ENTRY=SmokeExpense -e 'EXPECTED_AMOUNT_REGEX=^Expense · CHF 12\.34$' .maestro/authenticated-money-read.yaml`. Seed and independently reconcile that entry in the isolated household before running; this command does not seed data or fake authentication. Do not use production data for this flow. Record source/build identity, device/OS, fixture identity and actual results. A pass proves only this read/navigation journey, not Apple sign-in, writes, offline recovery or two-member acceptance. Native selector behavior remains unverified until execution.

## Progressive setup acceptance (prepared; not executed)

Use two existing test members in an isolated household, with an executable development build. Record the exact app/API commits, build ID, iOS version and device. Start the first member with no saved food profile; give the second member a saved profile. Do not reset production preferences or use private household data as fixtures. These checks require actual controls and navigation; client/runtime tests do not substitute for them.

1. Choose Start quickly and open Meals. Confirm the missing-food prompt appears without blocking the week. Open food preferences from the prompt, verify the dietary/privacy explanation, and return without saving. The prompt must still describe missing setup.
2. Save an explicit test food profile through the same form, leaving calories blank. Return to Meals and wait for the setup read to finish. The food prompt must disappear; a missing household-cooking prompt may remain. Inspect the authenticated setup response: configured flags and actor/household identities only, with no private profile values.
3. In a fresh missing-setup fixture, tap Not now. Confirm the prompt disappears and manual meal navigation still works. Dismissal is scoped to the mounted week, so reopening a week may offer setup again. After a failed setup read, verify retry/dismissal and continued meal access; an error must never be shown as saved preferences.
4. Switch to the other test member and repeat the read. Their saved food state must be independent; no old member status may flash or return after a delayed response. Shared cooking status should match the household’s actual saved choices.
5. For each reminder editor (chore, grocery, meal, recurring cycle, renewal), enter a valid unsaved change, open Review your notification setup, and return. Verify the same draft remains, no reminder was saved, and the explicit Save still reviews current item/revision and recipients. Repeat while offline or awaiting a Save outcome: the setup handoff must be disabled with the other editor controls.
6. Opening notification setup must not show an OS permission request, enroll a token, or change either member’s preferences. Only the explicit enable action may request permission. Declining permission must leave other features usable. The partner’s notification settings must remain private and unchanged.
7. Repeat the navigation with the keyboard open, large Dynamic Type and VoiceOver. Check that setup, dismissal, Save and back controls remain reachable and accurately announced. Record failures with their fixture/build identity; do not mark M3 accepted until both-member native evidence exists.

All cases above are pending. Local setup and notification lifecycle tests prove only their exercised service/controller boundaries.
