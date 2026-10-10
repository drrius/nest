# Calendar

Calendar shows the member's own iPhone calendars for a chosen day, after they grant calendar access, alongside household layers and their partner's busy times. Busy sharing is opt-in. It publishes only busy blocks, never event details.

## Sub-features

- `calendar-access` asks for calendar access with `Allow calendar access` and handles granted, denied and restricted states.
- `calendar-choose` selects which device calendars appear, through `Choose calendars`.
- `calendar-day` changes the shown day through `Choose day`.
- `calendar-layers` toggles `Show household chores` and `Show household renewals`. These are saved on the device only.
- `calendar-partner` shows the partner's busy times or `Availability is unknown`, and refreshes them.
- `calendar-busy-sharing` enables, publishes and turns off busy sharing.

## How to get to it (user POV)

- Choose the `Calendar` tab.
- From Today, choose `Open Calendar` under `On your calendar`.
- From Profile, choose `Calendar busy sharing`.

## Driving it with nest-verify

Preconditions:

- The baseline preconditions hold, and `$V signin $RUN member` has printed `SIGNED-IN`.
- The simulator's calendar permission is in the state under test. A fresh simulator starts unrequested. Grant it ahead of time with `ssh` to the Mac and `xcrun simctl privacy <udid> grant calendar ch.drrius.nest`, or revoke it with `revoke`. Use the `sim=` UDID from `$V doctor $RUN`.
- Busy sharing publishes the synthetic member's busy times to the backend. Turn it off again before cleanup.

- **Root.** Open Calendar. Run `$V ad $RUN press 'role=button label="Calendar"' --settle` and then `$V ad $RUN wait 'id="tab-header-calendar"'`. The snapshot shows `Your day, with room for everything.`
- **Access.** From the unrequested state, run `$V ad $RUN press 'label="Allow calendar access"' --settle`. iOS shows its calendar permission alert. Run `$V ad $RUN alert accept`. The card `Your day, in one place` is replaced by `On your calendar` and `Choose calendars`.
- **Denied.** After a revoke, relaunch with `$V ad $RUN open ch.drrius.nest --relaunch`. The card reads `Calendar access is off` and offers `Open Settings`.
- **Choose calendars.** Run `$V ad $RUN press 'label="Choose calendars"' --settle`. The `Your calendars` sheet lists per-calendar toggles. Toggle one, then press `Done`. Only events from the selected calendars appear under `On your calendar`.
- **Day.** Run `$V ad $RUN press 'label="Choose day"' --settle`, pick a date, then press `Done`. The day card's events follow the chosen day.
- **Layers.** Run `$V ad $RUN press 'label="Show household chores"' --settle`. The toggle's value flips. Relaunch to confirm it stayed.
- **Busy sharing.** Run `$V ad $RUN press 'label="Busy sharing"' --settle`, then `$V ad $RUN press 'label="Enable busy sharing"'` and `$V ad $RUN press 'label="Enable sharing"'`. Afterwards `Publish selected busy times` and `Turn off and remove shared busy times` are offered.
- **Proof.** Run `$V ad $RUN snapshot > evidence/verify-nest/$RUN/calendar.snapshot.txt` and `$V ad $RUN screenshot calendar.png`, then `$V pull $RUN`.

## Gotchas

- A fresh simulator has no user calendars, so `No events in your selected calendars for this day.` is expected. Add events in the simulator's Calendar app if the proof needs them.
- The permission alert belongs to iOS, not Nest. Use `$V ad $RUN alert accept` or `$V ad $RUN alert dismiss`, not a label press.
- Simulator calendar checks are not acceptance for real calendars on both phones. Record them as simulator evidence only.
- Partner availability shows `Availability is unknown` until Test Sam shares busy times. To change that, sign in as `partner` on a run, enable busy sharing and publish. Turn it off again afterwards.
