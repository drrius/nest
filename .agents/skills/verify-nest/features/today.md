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

- The baseline preconditions hold, and `$V signin $RUN member` has printed `SIGNED-IN`.
- Titles you create start with the run id, for example `$RUN chore`.
- The first-use sheet is dismissed. If `$V ad $RUN wait text "Welcome,"` matches, press `label="Get started"`. That choice is saved on the device only.

- **Root.** Open Today. Run `$V ad $RUN press 'role=button label="Today"' --settle` and then `$V ad $RUN wait 'id="tab-header-today"'`. The snapshot shows `A good day to keep it simple.`, `Around the house`, `On the menu` and `On your calendar`.
- **Filter.** Switch views. Run `$V ad $RUN press 'role=button label="Everyone"' --settle`. The `Everyone` control carries the selected trait, and the chore list changes or reads `Nothing due in this view.`
- **Add chore.** Run `$V ad $RUN press 'label="Add to your household"' --settle`, then `$V ad $RUN press 'label="Chore"' --settle`. The `Add chore` form shows a `[text-field] "What needs doing?"` row. Fill it by its ref, which was `@e9` in the proving run: `$V ad $RUN fill <ref> "$RUN chore" --settle`. Run `$V ad $RUN keyboard dismiss`, then `$V ad $RUN press 'role=button label="Add chore"' --settle`, then `$V ad $RUN wait 'role=button label="Done"' 20000`. The form shows `Chore added`, the title and `Your household chore was saved.`
- **Back on Today.** Run `$V ad $RUN press 'role=button label="Done"' --settle` and `$V ad $RUN wait text "$RUN chore" 20000`. `Around the house` lists a button labeled with the title. `$V ad $RUN get attrs <ref>` reports its value as `Due today`.
- **Complete chore.** Only for a chore this run created. Press the row's ref: `$V ad $RUN press <ref> --settle`. The row briefly shows `Saved. This will sync when online.` with `Retry sync`. After the sync it leaves the due list. A snapshot then shows `Nothing due in this view.` or the remaining chores, and `$V data $RUN after-complete` shows no `chore_operations` row with `pending`.
- **Persistence.** Relaunch with `$V ad $RUN open ch.drrius.nest --relaunch`, then run `$V ad $RUN wait text "Around the house" 20000`. The completed chore stays off the due list in both `Me + shared` and `Everyone`.
- **Groceries.** Run `$V ad $RUN press 'label="Groceries"' --settle`. The `Groceries` screen lists `To pick up` or `Nothing on the list right now.` To add an item, run `$V ad $RUN press 'label="Add grocery"'`, fill the name by ref, then `$V ad $RUN press 'label="Add"'`. Tapping the item's row toggles it. The section changes between `To pick up` and `Picked up · <n>`.
- **Proof.** Give each step its own screenshot, such as `$V ad $RUN screenshot today-root.png`, `today-chore-added.png`, `today-chore-completed.png` and `today-relaunched.png`. A repeated name overwrites the earlier capture. Then run `$V ad $RUN snapshot > evidence/verify-nest/$RUN/today.snapshot.txt` and `$V pull $RUN`.

## Gotchas

- Tapping an open chore row completes the chore at once. There is no confirmation step. Never tap a chore row only to inspect it.
- Tapping a grocery row toggles picked up at once. Use the row's `More options for <name>` menu to inspect or edit it.
- `Open meal plan` and `Open Calendar` push a full Meals or Calendar screen inside the Today stack. Afterwards `tab-header-meals` and `tab-header-calendar` match twice.
- `For your review` holds the member's private financial proposals. Its approval buttons post money. Treat them as described in [Money](./money.md).
- The date caption above `Today` follows the simulator's clock and time zone. Assert section content, not the caption.
- Label selectors did not match rows whose titles contain the run id, even though `$V ad $RUN get attrs` reports that exact label. Act on such rows by the ref from a fresh `$V ad $RUN snapshot -i`.
- Text fields are named by their placeholder, so `label=` stops matching once the field has text. Fill by ref.
- The keyboard covers `Add chore`. Run `$V ad $RUN keyboard dismiss` before pressing it.
- `Saved. This will sync when online.` appears for a moment on every completion, even when online. Wait for the row to leave the due list before treating it as offline.
