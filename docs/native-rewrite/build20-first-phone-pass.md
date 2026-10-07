# Build 20 first phone pass

Apple confirms Nest 0.1.0, build 20 is available for internal TestFlight testing.
Update to build 20 before this check. Build 20 uses the separate nest-test
project; Household OS production is unchanged. Live AI and push remain inactive.

1. Open Today, Meals, Calendar and Money. Check that titles, Profile/Ask controls,
   side margins and card content edges feel consistent. Repeat in dark mode and
   your preferred larger text size.
2. In Money, open Expense. Enter a fictional description and CHF 1.01, switch the
   payer and try equal, exact and percentage splits. Review should start at the
   amount/details, and Edit should keep your entries. Leave through Back and
   explicitly discard. Do not press Save merely to test presentation.
3. Open Money's Bills and approvals and Saved changes. Check the grouped controls
   are readable and tappable. Open your approvals list, then return.
4. From Today, open Groceries and the meal plan. In Meals, tap an empty slot, then
   Cancel without editing. It should close directly without adding a meal.
5. Report the iPhone model, iOS version, build number and any clipped, misplaced
   or confusing control. Both partners should try independently.

This short pass checks the consolidated candidate's layout and navigation. It does
not replace the [full phone acceptance](swiftui-phone-acceptance.md), including
financial accuracy/privacy, weekly planning, offline conflicts, calendars,
VoiceOver, Reduce Motion and push delivery. Preserve unresolved saved requests;
do not reinstall or clear app data to hide failures.
