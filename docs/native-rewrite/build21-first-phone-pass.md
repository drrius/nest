# Build21 first phone pass

Apple confirms the consolidated SwiftUI0.1.0/build21 candidate is VALID, internally
available and unexpired. Update to21 in your existing TestFlight installation. It uses nest-test, with push disabled; Household OS production is unchanged.

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
5. Report phone/iOS/build, clipped or confusing controls, and whether both partners
   can independently navigate without coaching. Preserve unresolved requests;
   do not reinstall or clear data to hide failures.

This short pass does not replace [full phone acceptance](swiftui-phone-acceptance.md).
Live AI, push delivery, weekly planning, financial recovery/privacy, real calendar
sharing, radio-loss conflicts, VoiceOver traversal and Reduce Motion remain separate
gates. A simulator or CI pass cannot close those hardware criteria.
