# Historical first phone pass: build 22

Build 23 is now the current candidate. Use the
[current short phone pass](build23-first-phone-pass.md) for its included fixes.

Apple confirms the consolidated SwiftUI0.1.0/build22 candidate is VALID, internally
available and unexpired. The retained filename and checklist describe that earlier
candidate. It uses nest-test, with push disabled; Household OS production is unchanged.

1. Open all four tabs and compare the header/actions, side margins and card edges
   in your normal appearance/text size, then dark mode and larger text.
2. In Groceries, check that section headings are readable. With VoiceOver, focus
   an item with a quantity and confirm it announces quantity and pickup state.
   The normal checklist action must remain obvious without VoiceOver.
3. In Money, draft an expense with a fictional description/CHF1.01 and try equal,
   exact and percentage splits. Review should start at its details; Edit preserves
   your entries. Explicitly discard instead of Save when checking presentation.
4. Open payment entry, inspect Full/Partial choices and review details, then Edit
   or discard. This records payments made elsewhere; it never transfers money.
5. In Money, open Saved changes. Bill confirmation appears only when this account
   has a saved variable-bill entry. Do not create an expense solely to test this link.
   If a real test entry is uncertain, preserve it and use its recovery actions.
6. Report phone/iOS/build, clipped or confusing controls, and whether both partners
   can independently navigate without coaching. Preserve unresolved requests;
   do not reinstall or clear data to hide failures.

This short pass does not replace [full phone acceptance](swiftui-phone-acceptance.md).
Live AI, push delivery, weekly planning, financial recovery/privacy, real calendar
sharing, radio-loss conflicts, VoiceOver traversal and Reduce Motion remain separate
gates. A simulator or CI pass cannot close those hardware criteria.
