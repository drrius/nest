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

- The baseline preconditions hold, and an owner-authorized member is signed in on the run's simulator.
- The owner has named the week, slot and meal titles this run may change. AI planning also needs the owner's go-ahead, because it spends the AI Gateway budget.

- **Week.** Open Meals. Run `nest-verify ad $RUN press 'label="Meals"' --settle` and then `nest-verify ad $RUN wait 'id="tab-header-meals"'`. The snapshot shows `Good food. One less daily decision.`, a week title in the form `d MMM – d MMM` and day cards titled `EEEE · d MMM`.
- **Navigate.** Run `nest-verify ad $RUN press 'label="Next week"' --settle`. The week title advances seven days. Run `press 'label="Previous week"' --settle` to return.
- **Add meal.** Press an empty slot labeled `<yyyy-MM-dd>, <slot>: Add meal`. Run `nest-verify ad $RUN press 'label="2026-10-12, dinner: Add meal"' --settle` with the authorized date and slot. The `Add meal` sheet appears with `One-off` / `Saved meal`. Fill `What are you having?` with the authorized title, then run `press 'role=button label="Save"' --settle`. The slot's label becomes `<date>, <slot>: <title>, recipe details`.
- **Options.** Run `nest-verify ad $RUN press 'label="2026-10-12, dinner: More options for <title>"' --settle`. A `Meal options` dialog offers `Replace`, `Plan leftovers`, `Move` and `Remove`. Each opens a sheet with `Cancel` and its confirm button. `Remove` asks `Remove <title>` again.
- **Ingredients.** Run `press 'label="Review ingredients"' --settle`. The screen offers `Save choices for later` and `Add <n> to groceries`. Confirming `Add to groceries` writes grocery items.
- **AI plan.** Only with the owner's go-ahead. Run `press 'label="Plan the week with AI"' --settle`, then `press 'label="Suggest a plan"'`, then `wait text "Approve plan"`. Before approval the week is unchanged. Prove that with a second read of the week. `Approve and save meals` is the only step that saves.
- **Persistence.** Relaunch with `nest-verify ad $RUN open ch.drrius.nest --relaunch` and return to the same week. Changed slots keep their titles.
- **Proof.** Run `nest-verify ad $RUN snapshot > evidence/verify-nest/$RUN/meals.snapshot.txt` and `nest-verify ad $RUN screenshot meals.png`, then `nest-verify pull $RUN`.

## Gotchas

- Slot labels embed the ISO date and slot name. Take them from a fresh `snapshot -i` rather than composing them by hand. Which slots exist (breakfast, lunch, dinner) depends on the household's cooking preferences.
- The week title reads `This week` until the week has loaded. Wait for the dated title before asserting.
- A denied or failed read deletes or freezes the cached week by design. `Showing saved meals` is the offline state, not a failure of the recipe.
- The setup card `Make meals fit your household` appears until meal setup is reviewed. It can push the day cards below the fold, so scroll with `scroll down --settle`.
- Live AI planning needs a meal-planning library on the backend. An empty library returns no suggestion. That is a data condition, not a UI failure.
