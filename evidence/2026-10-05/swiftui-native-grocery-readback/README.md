# Both-member native grocery readback

Six actual native methods pass without failures/skips. Both normal SDK accounts
read the exact confirmed100g rice item before and after each member independently
opens Today → Groceries. Both rendered rows show QA rice/100g, have an unchecked
To pick up value and a56pt minimum target, and both clients return to Today.
Neither checkmarks, menus, expense entry nor addition is tapped. The exact item
is unique among active same-name rows in this fictional household.
[Executions](results.json), [original member](original-native.png),
[partner](partner-native.png), [restoration](restoration.json).

The entire30-row grocery/six-link checkpoint is unchanged; all14 retained
meal/finance/history row sets also remain exact. Both normal SDK snapshots match
the preceding successful confirmation's canonical result. [Before](before-groceries.json),
[after](after-groceries.json), [history before](before-history.json),
[history after](after-history.json). This is read-only verification, not another
confirmation or a mock screen. Do not replay the ingredient addition.

The six pre-fix normal/light methods match812 native inputs after execution and local source. Both fictional
memberships, stable test origins, large/light and64 empty command journals per
client remain. Strict focused Mac Swift formatting/source limits pass.
[Source inventory](source-inputs.json). This initial checkpoint precedes the shipping fix below. Largest/dark,
VoiceOver, offline radio and actual phone acceptance are separate checks.
The current-source CI receipt is recorded below. No model call, new beta, purchase, production or merge.

## Accessibility failure and verified shipping fix

The first maximum/dark attempt passes both SDK reads, then fails while positioning
the Today grocery shortcut before entering Groceries. The recorded frame shows
icons crowding the text until the card exceeds the available viewport. The strict
fully-visible target check is retained; no checkmark, confirmation or menu is used.
[Failure](fixed-and-diagnostic/maximum/failure-excerpt.txt),
[frame](fixed-and-diagnostic/maximum/failure-frame.png),
[restoration](fixed-and-diagnostic/maximum/restoration.json).

At accessibility sizes TodayGroceryShortcut gives the text the full card width;
ordinary sizes retain the existing basket/text/chevron layout. No text cap or
line limit is introduced. Both members then pass the same six checks at maximum
text/dark and six at normal/light. All four final grocery images are reviewed:
QA rice/100g is visible, unchecked, with no clipping in the asserted target.
[Maximum](fixed-and-diagnostic/maximum-fixed/results.json),
[normal](fixed-and-diagnostic/normal-fixed/results.json). Both exact813-input
inventories match the tested source and local shipping treee7926c89.

Both clients return to Today/large/light, original actors and64 empty journals;
before/after ordinary SDK snapshots match the preceding one-confirmation result.
The whole30-row grocery/six-link and14 retained history checkpoints are unchanged
after both fixed journeys. [Groceries](after-fixed-groceries.json),
[history](after-fixed-history.json). No ingredient addition is replayed.
The header correction is separately verified in the [root layout evidence](../swiftui-root-layout/README.md).
Full accessibility, VoiceOver, Reduce Motion and actual phones remain open.
SwiftUI37374014748 and Nest37374014717 both pass for exacte7926c89;
manual native executions are separate from CI guarded-test compilation.
Build18 is signed and verified with this fix, and both exact-source CI workflows pass. One authorized private upload is now being observed; TestFlight availability
is unverified. See [updated candidate](../swiftui-build18-layout/README.md).
