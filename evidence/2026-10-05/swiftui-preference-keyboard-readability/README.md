# Cooking notes and keyboard readability

Parent source80447fed; this slice changes the SwiftUI Cooking preferences form,
adds its native UITextView adapter and three hosted native tests. The earlier
shipping source is d6189131. The authorized SE3 simulator runs iOS26.3 against
nest-test with push disabled. No production account, model call, Save or beta
is used.

## Demonstrated defect and fix

The expanding vertical field hides final notes behind the keyboard at maximum
Dynamic Type. Two bounded SwiftUI TextEditor attempts and the default UITextView
also clip the last word. These actual input/typed-suffix failures remain under
`before-*`, `first-*`, `second-*` and `uikit-default-*`.

Read-only inspection of the held-open native editor isolates the layout issue:
TextKit2 reports content height1585 while its final caret ends at1635.5, so native
scrolling cannot display the entire line. Completing its layout does not fix
this. A diagnostic TextKit1 switch reports height1787 and a caret ending1779.5;
that screenshot is diagnostic evidence, not shipping acceptance. The log records
explicit debugger detach; three earlier expression compiler failures were also
followed by restoring the owned app process.

The shipping adapter explicitly creates UITextView with TextKit1. It uses the
native preferred body font, Dynamic Type adjustment and a180pt normal/240pt
accessibility viewport. Its delegate updates the existing notes binding; disabled
forms prevent editing and selection. The empty placeholder ignores touches.
Save, canonical reload, validation and conflict authority remain in the existing
model. No keyboard offsets, font shrinkage or forced layout workaround is added.

## Native verification

All1,045 native source inputs match the Mac mirror. Strict Swift formatting,
source limits and actual signing pass. Foundation execution reports8 methods:
6 pass;2 hosted checks explicitly skip because isolated credentials are not
configured. Eight signed-native methods (three actual UIKit/input methods and
five cooking/food model methods) pass with zero failures/skips. They cover2000
UTF16 input, largest body font, disabled editing, complete final-caret scrolling,
exact lost-response retry, account isolation, late reads and conflict discard.

Early test windows lacked a UIWindowScene; their synchronous/settled scroll
assertions failed in both engines. Those failures are retained and are not
claimed as reliable negative regression proof. The corrected test attaches to
the actual scene and obtains keyboard focus, preserving the full visibility
assertion. Actual rendered failure and success remain the layout evidence.

The installed final-source candidate matches the signed executable and retains
original profiles, data/Keychain and64 empty scoped journals. Actual eight-line
input plus one typed final `!` at maximum text/dark shows the full last sentence
and cursor above the keyboard, with the44pt Save target visible. Normal/light
typing also shows the full final line and cursor. No debugger intervenes in
either final input. Both Back/reopen checks restore blank notes/revision6,
original food/revision5 and64 empty journals. Today/default text/light is restored.
All seven scoped hosted aggregates are identical before/after, including all61
financial events/102 allocations/122 ledger entries and preference receipts.
These privileged retention reads do not establish fresh RLS or live balances.

Observer corrections preserve wrong labels, scroll-tier failures after actual
movement and the initial pre-execution Python syntax error. No successful input,
typed suffix or Save is repeated to repair an observer failure.

## Design checkpoint and limits

Mobile-design skill; iPhone only, SwiftUI. Its iOS, design-thinking, touch,
performance, backend, testing, debugging, navigation, typography, color and
decision references were read. Apply semantic Dynamic Type, native scrolling
and44pt controls; keep domain rules outside views. Its audit reports zero
checks, so nominal PASS is not SwiftUI proof.

Current-head CI is pending. Hosted retention is verified. Full VoiceOver speech/
focus, other editors, both phones and M1–M9 acceptance remain open. This bounded
simulator check does not establish phone, provider, release or full acceptance.
