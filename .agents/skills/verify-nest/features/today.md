# Today

Today is the first tab a signed-in member sees. It shows the household's chores, groceries, today's meals, bills to confirm, calendar access, and financial proposals that are private to the member. An add menu creates chores, groceries and expenses.

## Sub-features

- `today-root` shows the header `Today` and the `Around the house`, `On the menu`, `On your calendar` and `For your review` sections.
- `today-filter` switches the chore list between `Me + shared` and `Everyone`.
- `today-chore-complete` completes a chore with a single tap on its row.
- `today-chore-add` adds a chore from `Add` → `Chore`.
- `today-groceries` opens the grocery list, adds an item and toggles it picked up.
- `today-offline` shows saved chores and meals with a sync notice when the network fails.
- `today-links` reaches Meals, Calendar, `Your approvals`, `Renewals` and `Daily summary` from Today's links.

## How to get to it (user POV)

- Sign in. Today is the selected tab after launch.
- Choose the `Today` tab from any other tab.
- Choose `Add` (accessibility label `Add to your household`) for `Chore`, `Grocery` or `Expense`.
- Choose the `Groceries` card, or `Add` → `Grocery`, to open the grocery list.

## Driving it with nest-verify

Preconditions:

- The baseline preconditions hold, and an owner-authorized member is signed in on the run's simulator.
- The owner has said which chores and grocery items this run may create or change.
- The first-use sheet is dismissed. If `wait text "Welcome,"` matches, press `label="Get started"`. That choice is saved on the device only.

- **Root.** Open Today. Run `nest-verify ad $RUN press 'label="Today"' --settle` and then `nest-verify ad $RUN wait 'id="tab-header-today"'`. The snapshot shows `A good day to keep it simple.` and the section headings above.
- **Filter.** Switch views. Run `nest-verify ad $RUN press 'label="Everyone"' --settle`. The `Everyone` control carries the selected trait, and the chore list changes or reads `Nothing due in this view.`
- **Add chore.** Run `nest-verify ad $RUN press 'label="Add to your household"' --settle`, then `nest-verify ad $RUN press 'label="Chore"' --settle`. The `Add chore` form appears. Fill the title field from the snapshot ref with the authorized title, then run `nest-verify ad $RUN press 'role=button label="Add chore"' --settle`. A `Done` button appears. Back on Today, the chore row is labeled with the title.
- **Complete chore.** Only for an authorized chore. Run `nest-verify ad $RUN press 'label="<chore title>"' --settle`. The row's accessibility value becomes `Done`, or `Saved · waiting to sync` when offline.
- **Groceries.** Run `nest-verify ad $RUN press 'label="Groceries"' --settle`. The `Groceries` screen lists `To pick up` or `Nothing on the list right now.` To add an item, run `press 'label="Add grocery"'`, fill the name, then `press 'label="Add"'`. Tapping the item's row toggles it. The section changes between `To pick up` and `Picked up · <n>`.
- **Persistence.** Relaunch with `nest-verify ad $RUN open ch.drrius.nest --relaunch`, then return to Today. The completed chore and the grocery item keep their state.
- **Proof.** Run `nest-verify ad $RUN snapshot > evidence/verify-nest/$RUN/today.snapshot.txt` and `nest-verify ad $RUN screenshot today.png`, then `nest-verify pull $RUN`.

## Gotchas

- Tapping an open chore row completes the chore at once. There is no confirmation step. Never tap a chore row only to inspect it.
- Tapping a grocery row toggles picked up at once. Use the row's `More options for <name>` menu to inspect or edit it.
- `Open meal plan` and `Open Calendar` push a full Meals or Calendar screen inside the Today stack. Afterwards `tab-header-meals` and `tab-header-calendar` match twice.
- `For your review` holds the member's private financial proposals. Its approval buttons post money. Treat them as described in [Money](./money.md).
- The date caption above `Today` follows the simulator's clock and time zone. Assert section content, not the caption.
