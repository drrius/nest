# Meals

Meals shows the household's week of planned meals by day and slot. A member can add a one-off or saved meal, replace, move or remove a planned meal, plan leftovers, review ingredients into groceries, and ask the AI for a week plan that saves nothing until approved.

## Sub-features

- `meals-week` shows the week title, day cards and `Previous week` / `Next week` navigation.
- `meals-add` adds a one-off or saved meal to an empty slot.
- `meals-options` replaces, moves, removes or plans leftovers for a planned meal through `Meal options`.
- `meals-recipe` opens a planned meal's recipe details.
- `meals-ingredients` reviews the week's ingredients and adds them to groceries.
- `meals-ai-plan` suggests a plan with AI and saves it only after `Approve and save meals`.
- `meals-offline` shows saved meals with `Connect and refresh before changing the week.` when the read fails.

## How to get to it (user POV)

- Choose the `Meals` tab.
- From Today, choose `Open meal plan` or a meal row under `On the menu`.
- Within Meals, choose `Plan the week with AI`, `Review ingredients`, `Saved meals`, `Your food preferences` or `Cooking preferences`.

## Driving it with nest-verify

Preconditions:

- The baseline preconditions hold, and `$V signin $RUN member` has printed `SIGNED-IN`.
- Meal titles you create start with the run id. Prefer a week other people's runs are unlikely to use, such as one several weeks ahead.
- AI planning spends the owner's AI Gateway budget. Run it only when the change under test touches AI planning.

- **Week.** Open Meals. Run `$V ad $RUN press 'role=button label="Meals"' --settle` and then `$V ad $RUN wait 'id="tab-header-meals"'`. The snapshot shows `Good food. One less daily decision.`, a week title in the form `d MMM – d MMM` and day cards titled `EEEE · d MMM`.
- **Navigate.** Run `$V ad $RUN press 'label="Next week"' --settle`. The week title advances seven days. Run `$V ad $RUN press 'label="Previous week"' --settle` to return.
- **Add meal.** Find an empty slot in `$V ad $RUN snapshot -i`. Its button reads `<yyyy-MM-dd>, <Slot>: Add meal`, with a capitalized slot such as `Dinner`. Press it by its ref: `$V ad $RUN press <ref> --settle`. The `Add meal` sheet appears with `One-off` / `Saved meal`. Fill the `What are you having?` field by its ref with a run-prefixed title, run `$V ad $RUN keyboard dismiss`, then run `$V ad $RUN press 'role=button label="Save"' --settle`. The slot's label becomes `<date>, <slot>: <title>, recipe details`.
- **Options.** Find the planned meal's `<yyyy-MM-dd>, <Slot>: More options for <title>` button in a fresh `$V ad $RUN snapshot -i`, then run `$V ad $RUN press <ref> --settle`. A `Meal options` dialog offers `Replace`, `Plan leftovers`, `Move` and `Remove`. Each opens a sheet with `Cancel` and its confirm button. `Remove` asks `Remove <title>` again.
- **Ingredients.** Run `$V ad $RUN press 'label="Review ingredients"' --settle`. The screen offers `Save choices for later` and `Add <n> to groceries`. Confirming `Add to groceries` writes grocery items.
- **AI plan.** Only when the change touches AI planning. Run `$V ad $RUN press 'label="Plan the week with AI"' --settle`, then `$V ad $RUN press 'label="Suggest a plan"'`, then `$V ad $RUN wait text "Approve plan"`. Before approval the week is unchanged. Prove that with a second read of the week. `Approve and save meals` is the only step that saves.
- **Persistence.** Relaunch with `$V ad $RUN open ch.drrius.nest --relaunch` and return to the same week. Changed slots keep their titles.
- **Proof.** Run `$V ad $RUN snapshot > evidence/verify-nest/$RUN/meals.snapshot.txt` and `$V ad $RUN screenshot meals.png`, then `$V pull $RUN`.

## Gotchas

- Slot labels embed the ISO date of the displayed week and the capitalized slot name, as in `2026-10-12, Dinner: Add meal`. A hard-coded date stops matching once that week scrolls out of view, and run-prefixed titles may not match `label=` selectors. Act on refs from a fresh `$V ad $RUN snapshot -i`. Which slots exist (`Breakfast`, `Lunch`, `Dinner`) depends on the household's cooking preferences.
- The week title reads `This week` until the week has loaded. Wait for the dated title before asserting.
- A denied or failed read deletes or freezes the cached week by design. `Showing saved meals` is the offline state, not a failure of the recipe.
- The setup card `Make meals fit your household` appears until meal setup is reviewed. It can push the day cards below the fold, so scroll with `$V ad $RUN scroll down --settle`.
- Live AI planning needs a meal-planning library on the backend. An empty library returns no suggestion. That is a data condition, not a UI failure.
