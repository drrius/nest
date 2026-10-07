# Build 23 first phone pass

Apple confirms SwiftUI 0.1.0/build 23 is valid, internally available and unexpired.
Update through your existing TestFlight installation. Its frozen source is
`9ecfdca2`. It uses nest-test, separate from Household OS
production, and keeps push disabled. The archive is built locally on the Mac;
it does not use an Expo cloud-build slot.

This candidate includes the fixes after build 22: saved Today meals remain
visible during refresh, denied or old-account meal replies cannot repopulate
local read copies, Money history has consistent row spacing, and correction and
recurring-rule pickers have larger touch targets.

Before updating, reconnect and synchronize any pending grocery/chore changes.
Preserve unresolved saved requests; do not delete or reinstall the app to hide a
failure.

1. Update through your existing TestFlight installation. Each partner should
   confirm their own profile and household after opening the app.
2. Compare the four tabs' headers, side margins and card edges in your normal
   appearance, dark mode and preferred larger text. Report clipping or layout
   differences with a screenshot and the installed build number.
3. If you already have a saved meal for today, refresh Today and check that it
   remains visible while loading. Open the meal and return. Do not create data
   solely to test this cache fix.
4. Open Money history and an entry. Check spacing and readability. Draft an
   expense, review its amount/split, return through Edit and explicitly discard
   instead of Save when checking presentation.
5. Open correction or recurring-rule forms and inspect their pickers with the
   keyboard and larger text. Keep any existing pending request intact; do not
   confirm a financial change solely to check touch targets.
6. Report phone/iOS/build, what worked, confusing controls and loading errors.
   Both partners should try ordinary navigation independently.

This short pass does not replace [full phone acceptance](swiftui-phone-acceptance.md).
Live AI, push/scheduling, real radio-loss recovery, Calendar privacy and full
accessibility remain separate gates. Simulator and CI checks do not establish
physical-phone acceptance or authorize production cutover.
