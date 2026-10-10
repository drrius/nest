# Launch and sign-in

A fresh install opens on Nest's sign-in screen. Its only action is Apple's `Sign in with Apple` button. A signed-in member who is linked to a household reaches the four tabs. Other accounts see a not-linked, unavailable or loading state instead. A fresh owned simulator drives the signed-out half without an account. Its signed-in half uses the synthetic verification accounts.

## Sub-features

- `launch-signed-out` shows `Nest`, `A little less to remember.` and the `Sign in with Apple` button after a fresh install.
- `signin-apple-sheet` presents Apple's system sign-in UI when the button is pressed.
- `signin-failure-message` shows `Sign-in could not be verified. Please try again.` when Apple returns an error other than cancel. The message clears on relaunch.
- `launch-no-local-data` leaves the scoped offline store empty while signed out.
- `signin-synthetic` signs the run in as Test Alex or Test Sam and lands on the first-use sheet, then on Today.
- `session-states` covers `Checking your account…`, the not-linked message with `Sign out`, and `Could not verify your account. Try again online.` with `Try again` and `Sign out on this device`. The synthetic accounts show only the brief `Checking your account…`. The other two need an account that is not linked or cannot be reached.

## How to get to it (user POV)

- Install and open Nest with no saved session.
- Sign out from Profile → `Sign out on this device`. That needs a signed-in member.
- Press `Sign in with Apple` on the sign-in screen.
- For agent runs, `$V signin $RUN member` or `partner` stands in for Apple sign-in. It installs a password session for a synthetic account. That proves the signed-in app, not Apple sign-in.

## Driving it with nest-verify

Preconditions:

- The baseline preconditions hold, on a simulator created by this run. A new owned simulator has no Apple Account and no Nest session.

- **Signed-out screen.** Read the launch screen. Run `$V ad $RUN snapshot -i`. It lists the texts `A little less to remember.` and `One place for your household’s day, meals and shared expenses.`, and a button `Sign in with Apple`. Run `$V ad $RUN screenshot sign-in-signed-out.png`.
- **Apple sheet.** Press the button. Run `$V ad $RUN press 'label="Sign in with Apple"' --settle`. With no Apple Account, the diff shows an alert `Sign in to your Apple Account` with the buttons `Close` and `Settings`. Run `$V shot $RUN sign-in-apple-sheet`.
- **Failure message.** Dismiss the alert. Run `$V ad $RUN press 'role=button label="Close"' --settle`. The diff adds the text `Sign-in could not be verified. Please try again.` above `Sign in with Apple`. Run `$V ad $RUN screenshot sign-in-after-close.png`.
- **Relaunch clears it.** Run `$V ad $RUN open ch.drrius.nest --relaunch`, then `$V ad $RUN wait text "A little less to remember."`, then `$V ad $RUN wait absent 'label="Sign-in could not be verified. Please try again."'`. All three exit `0`.
- **No local data.** Run `$V data $RUN signed-out`. The data container holds one `nest-offline-<fingerprint>.sqlite`, and the listing ends `total rows: 0`.
- **Synthetic sign-in.** Run `$V signin $RUN member`. It ends with `SIGNED-IN run=$RUN role=member`. `$V ad $RUN snapshot` shows `Welcome, Test Alex.` with `Get started` and `Set up everything`. Run `$V ad $RUN press 'label="Get started"' --settle`. The tab bar appears with `Today` selected.
- **Switch member.** Run `$V signin $RUN partner`. The app relaunches showing `Welcome, Test Sam.`
- **Proof.** Run `$V pull $RUN`. `evidence/verify-nest/$RUN/` then holds `drive.log`, the screenshots, `data-signed-out.txt` and `signin-<role>.log`, the fixture test's output.

## Gotchas

- With no Apple Account on the simulator, `Close` is reported as an error, not a cancel. The app therefore shows the failure message. Do not read that message as a backend failure. Nest sends no request to its backend on this path.
- Pressing `Settings` in Apple's alert leaves Nest for the Settings app. Return with `$V ad $RUN open ch.drrius.nest`.
- Completing real Apple sign-in needs an Apple Account on the simulator, and it would reach the owner's real household. Agents use `$V signin` instead and never sign in with Apple.
- The `Nest` heading can come back as the application node rather than a text node. Assert on `A little less to remember.` and the button, not on `Nest`.
- Run the signed-out steps before `signin`. Once a session exists, the app opens signed in until `Sign out on this device`.
- The offline store is created at launch, scoped to the configured Supabase URL. Its existence is expected. Rows in it while signed out are not.
