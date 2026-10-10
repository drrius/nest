# Launch and sign-in

A fresh install opens on Nest's sign-in screen. Its only action is Apple's `Sign in with Apple` button. A signed-in member who is linked to a household reaches the four tabs. Other accounts see a not-linked, unavailable or loading state instead. This is the one feature a fresh owned simulator can drive without an account.

## Sub-features

- `launch-signed-out` shows `Nest`, `A little less to remember.` and the `Sign in with Apple` button after a fresh install.
- `signin-apple-sheet` presents Apple's system sign-in UI when the button is pressed.
- `signin-failure-message` shows `Sign-in could not be verified. Please try again.` when Apple returns an error other than cancel. The message clears on relaunch.
- `launch-no-local-data` leaves the scoped offline store empty while signed out.
- `session-states` covers `Checking your account…`, the not-linked message with `Sign out`, and `Could not verify your account. Try again online.` with `Try again` and `Sign out on this device`. All of them need an Apple account.

## How to get to it (user POV)

- Install and open Nest with no saved session.
- Sign out from Profile → `Sign out on this device`. That needs a signed-in member.
- Press `Sign in with Apple` on the sign-in screen.

## Driving it with nest-verify

Preconditions:

- The baseline preconditions hold, on a simulator created by this run. A new owned simulator has no Apple Account and no Nest session.

- **Signed-out screen.** Read the launch screen. Run `nest-verify ad $RUN snapshot -i`. It lists the texts `A little less to remember.` and `One place for your household’s day, meals and shared expenses.`, and a button `Sign in with Apple`. Run `nest-verify ad $RUN screenshot sign-in-signed-out.png`.
- **Apple sheet.** Press the button. Run `nest-verify ad $RUN press 'label="Sign in with Apple"' --settle`. With no Apple Account, the diff shows an alert `Sign in to your Apple Account` with the buttons `Close` and `Settings`. Run `nest-verify shot $RUN sign-in-apple-sheet`.
- **Failure message.** Dismiss the alert. Run `nest-verify ad $RUN press 'role=button label="Close"' --settle`. The diff adds the text `Sign-in could not be verified. Please try again.` above `Sign in with Apple`. Run `nest-verify ad $RUN screenshot sign-in-after-close.png`.
- **Relaunch clears it.** Run `nest-verify ad $RUN open ch.drrius.nest --relaunch`, then `nest-verify ad $RUN wait text "A little less to remember."`, then `nest-verify ad $RUN wait absent 'label="Sign-in could not be verified. Please try again."'`. All three exit `0`.
- **No local data.** Run `nest-verify data $RUN signed-out`. The data container holds one `nest-offline-<fingerprint>.sqlite`, and the listing ends `total rows: 0`.
- **Proof.** Run `nest-verify pull $RUN`. `evidence/verify-nest/$RUN/` then holds `drive.log`, the screenshots and `data-signed-out.txt`.

## Gotchas

- With no Apple Account on the simulator, `Close` is reported as an error, not a cancel. The app therefore shows the failure message. Do not read that message as a backend failure. Nest sends no request to its backend on this path.
- Pressing `Settings` in Apple's alert leaves Nest for the Settings app. Return with `nest-verify ad $RUN open ch.drrius.nest`.
- Completing Apple sign-in needs a real Apple Account signed in on the simulator. Only the owner may do that, in Simulator.app on the Mac. The account it signs in to is the real household on the permanent backend.
- The `Nest` heading can come back as the application node rather than a text node. Assert on `A little less to remember.` and the button, not on `Nest`.
- The offline store is created at launch, scoped to the configured Supabase URL. Its existence is expected. Rows in it while signed out are not.
