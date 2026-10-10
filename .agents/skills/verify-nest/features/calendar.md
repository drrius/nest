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

- The baseline preconditions hold, and an owner-authorized member is signed in on the run's simulator.
- The simulator's calendar permission is in the state under test. A fresh simulator starts unrequested. Grant it ahead of time with `ssh` to the Mac and `xcrun simctl privacy <udid> grant calendar ch.drrius.nest`, or revoke it with `revoke`. Use the `sim=` UDID from `nest-verify doctor $RUN`.
- Busy sharing writes to the backend. Run it only with the owner's go-ahead.

- **Root.** Open Calendar. Run `nest-verify ad $RUN press 'label="Calendar"' --settle` and then `nest-verify ad $RUN wait 'id="tab-header-calendar"'`. The snapshot shows `Your day, with room for everything.`
- **Access.** From the unrequested state, run `nest-verify ad $RUN press 'label="Allow calendar access"' --settle`. iOS shows its calendar permission alert. Run `nest-verify ad $RUN alert accept`. The card `Your day, in one place` is replaced by `On your calendar` and `Choose calendars`.
- **Denied.** After a revoke, relaunch with `nest-verify ad $RUN open ch.drrius.nest --relaunch`. The card reads `Calendar access is off` and offers `Open Settings`.
- **Choose calendars.** Run `press 'label="Choose calendars"' --settle`. The `Your calendars` sheet lists per-calendar toggles. Toggle one, then press `Done`. Only events from the selected calendars appear under `On your calendar`.
- **Day.** Run `press 'label="Choose day"' --settle`, pick a date, then press `Done`. The day card's events follow the chosen day.
- **Layers.** Run `press 'label="Show household chores"' --settle`. The toggle's value flips. Relaunch to confirm it stayed.
- **Busy sharing.** Only with the owner's go-ahead. Run `press 'label="Busy sharing"' --settle`, then `press 'label="Enable busy sharing"'` and `press 'label="Enable sharing"'`. Afterwards `Publish selected busy times` and `Turn off and remove shared busy times` are offered.
- **Proof.** Run `nest-verify ad $RUN snapshot > evidence/verify-nest/$RUN/calendar.snapshot.txt` and `nest-verify ad $RUN screenshot calendar.png`, then `nest-verify pull $RUN`.

## Gotchas

- A fresh simulator has no user calendars, so `No events in your selected calendars for this day.` is expected. Add events in the simulator's Calendar app if the proof needs them.
- The permission alert belongs to iOS, not Nest. Use `alert accept` or `alert dismiss`, not a label press.
- Simulator calendar checks are not acceptance for real calendars on both phones. Record them as simulator evidence only.
- Partner availability needs a linked partner who shares busy times. A one-member household always shows `Availability is unknown`.
