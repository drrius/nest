# Native accessibility audit — 5 October 2026

Scope: authorized smallest SE3 simulator, iOS26.3, Xcode27.0 (27A266a), signed
Debug app, real separate nest-test API, existing test-member Keychain session.
This is native execution. No model call, financial command, Calendar permission
grant, beta submission, production action or purchase occurred.

## Implementation

Six Calendar section headings now use explicit Quiet ink, semantic subheadline
type and the accessibility heading trait. The Calendar list has an explicit
semantic body font. The initial permission heading's contrast warning disappears;
the partner heading near the floating bar still fails. This does not establish
all contrast or Dynamic Type acceptance.

`NestAccessibility` is a separate manual XCUITest scheme. The default Nest CI
scheme does not run it; formatting and source limits include its sources.
The full audit reports every issue: the diagnostic handler returns false for all
findings and attaches the reported descriptions and bounds. No issue is filtered.

## Native evidence

The full five-test run fails with20 findings, zero suppressed. The records are
split by test in this directory. Four initial tab viewports are exercised; the
fifth test focuses on Calendar Dynamic Type and control checks and also fails.
The same Calendar warnings appear in both Calendar tests, so20 is a finding count,
not20 independently distinct defects.

Calendar still reports four font-size warnings and one clipped availability
paragraph. Contrast findings include content near/beneath the floating bar,
offscreen bounds, and nil-element reports on Money/Meals. Their bounds and crops
were inspected. The native bar/scroll-edge involvement is evidence to investigate,
not grounds to dismiss or suppress these findings.

A stronger native scroll-edge treatment was tried, remained failing and was
removed. The first preflight counted only status-column journals and refused
before launching; the corrected check recognizes all64 command/decision slots.
Xcode replaces the simulator container path on reinstall; the journal observer
now resolves the current container after each run. The64 slots remain empty.

Actual normal/light and largest/dark permission-reading tests pass, exposing all
three public permission controls above the bar and a minimum44pt access target.
The explanation grows from94.5pt to465.5pt; the Full Access paragraph grows from
68pt to378.5pt; the button grows from52pt to217.5pt. All full text was inspected in
the actual screenshots. This proves these endpoints scale, not every intermediate
size or a clean full audit. Bounds are recorded for both configurations.

The first largest observer incorrectly waited for an offscreen lazy List row.
The next observer overshot with fixed-distance scrolling. An adaptive, slower
drag now reveals each complete row. The corrected test passes at largest/dark and
again at normal/light. No access button was pressed. Each run preserves64 empty
journals; original large/light settings, stable separate-test origins and disabled
push are verified afterwards. The app is signed and relaunched with the existing
Keychain. All639 compiled app/test/project source inputs match Linux and the Mac.

Private raw result bundles, full rendered financial content and credentials stay
outside the repository. This evidence does not close M1, M6 or M9, or prove phone
VoiceOver, haptics, all forms or two-member usability. The owner-facing candidate
remains build17; this pass does not produce a new release.
