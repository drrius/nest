# Consistent Quiet tab roots

The owner’s four build17 phone images show inconsistent root headers and insets,
especially Calendar. Source confirms three separate layout paths: Today’s custom
header,20pt all-edge Meals padding versus14pt top on Today/Money, and Calendar’s
header inside an inset native List section header.

The change reuses QuietTabHeader for all four tabs and one20pt horizontal/14pt top
content-inset modifier for scroll roots. Header-to-content spacing uses24pt.
Calendar uses the same scrolling-page layout and shared Quiet section cards,
including20pt inner padding, native44pt button labels and semantic section headers.
Its native date/calendar pickers, permission states, personal-only event details,
unknown availability and opt-in layers remain. Lazy stacks retain virtualized
content. At accessibility sizes the shared header reserves a scaled context area
so a wrapped Today date does not shift the title/actions.

Native verification runs on the two authorized fictional-member simulators with
stable test origins and push disabled. Two baseline attempts stop before layout
comparison: an unrelated library-navigation helper and a header-return helper.
The final check captures cold-launch roots directly using stable semantic element
identifiers. It captures all four headers, tests both Profile/private-conversation
navigation links and compares actual title/action frames. An interim native List
header-row implementation fails when tapping Calendar Profile also opens the
assistant. That implementation is removed. The scrolling Calendar fixes the real
cross-navigation failure. Normal/light, normal/dark and maximum/dark all pass:
12 native root captures and24 Profile/private-conversation navigation links.
The12 retained screenshots were visually reviewed. All normal-size titles start
at x20/y82pt and Profile actions at x311/y34pt on the375pt-wide SE3. At maximum
text, title y219/218.5pt and action y150/149.5pt differ only by half-point rounding;
left margins remain20pt, right action margins20pt and targets at least44pt.
Different subtitle lengths can wrap; they do not move other tabs’ header anchors.

Two additional native checks pass normal/light and maximum/dark date-picker
opening/closing, unchanged day, visible44pt targets and return to Today. The two
simulators have not granted Calendar permission, so the conditional calendar
selection branch is not executed; its shared44pt Done control is compiled only.
No calendar selection, permission or model request changes. Both clients restore
large/light settings, original fictional membership,64 empty journals and stable
test origins. The earlier failed observers and List cross-navigation case remain
in native-executions.json; picker-executions.json records the precise branch coverage.
Source-identity.json matches all13 changed Swift/UI-check files to the picker run.
The header run precedes only the two modal Done changes and the added picker method;
the shared header/insets/cards are identical. Revalidation immediately after the
picker run matched all807 recorded inputs; inventory includes guarded preparations, not a claim
that every recorded file or pending meal fixture executed.
This does not close the20-report accessibility audit or establish phone acceptance.
No beta, production operation, purchase or merge is performed.

The preceding recipe commit606f77b5 passes Nest37361685211 and
SwiftUI37361685407 (496 Foundation/41 skips,438 signed-app/16 skips, zero failures,
format/source limits/signing and guarded UI compilation). Those runs precede this
root-layout change and are not its CI evidence. Focused native execution, strict
Swift formatting and source-limit checks verify this change locally on the Mac.

Exact layout source9d309418 now passes SwiftUI37363877080:496 Foundation/41 skips,
438 signed-app/16 skips, zero failures, formatting/source limits/signing and UI
compilation. [Native CI](native-ci.json). Nest37363877026 first failed before
executing any steps: GitHub reported “The job was not acquired by Runner of type
hosted even after multiple attempts.” Its same-source failed job is rerun as
attempt2 also fails before any step with runnerId0 and the same allocation error.
[Second attempt](routine-attempt2.json). Descendant d2330171 passes both workflows
with identical shipping Swift code; build18 reserves only the native version plus
guarded test additions. The original unpublished package is preserved. The current build18 candidate
also includes the demonstrated large-text grocery shortcut fix and is tracked
in [updated preparation](../swiftui-build18-layout/README.md). Exact-source CI and
private submission remain required. Physical-phone acceptance remains open.
