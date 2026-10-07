# Financial value contrast

Source `916b744c` replaces 118 native convenience label/value rows across 25 Money
files with QuietValueRow. The component keeps native LabeledContent layout, uses
QuietPalette.ink for both sides and explicitly combines accessibility children.
Existing expense rows already use the same explicit foreground color.

The prior captured payment value uses actual RGB 138/138/142 on white, 3.44:1.
The new light capture contains actual RGB 39/58/49 on white, 12.10:1.
The actual dark capture uses RGB 238/242/233 on the native Form's RGB 28/28/30
surface, 15.00:1. The screenshots are inspected and sampled. This fixes
primary financial facts, without claiming the muted heading/tab-bar/full-page
contrast issues are resolved.

The initial styled row at `e48df2d1` split label/value accessibility elements; the
470-second bounded reader search fails and restores scopes/settings. The actual
hierarchy identifies separate Amount and CHF 0.01 elements. Explicit combining
restores the expected "Amount, CHF 0.01" label. The observer now uses a 15-second
existence wait with a hierarchy capture instead of scanning an absent exact label.

One source-matched real fictional native light-mode partial-payment entry/review/
discard method passes without skips, about 67 seconds. No payment is recorded.
The same source-matched dark flow also passes without skips. Both controllers
restore original scopes, 64 empty journals, display and local privacy/first-use
choices. All eight protected post-check fingerprints remain exact, including
62 financial events, 104 allocations and 124 ledger rows. Source
format/limits/signing/compilation pass for all 118 callers. These are native UI
checks, not provider, phone or full accessibility acceptance. Contrast source
`5d946dca` passes routine37583789992/native37583789861:509 Foundation/41 skips,
478 signed-app/41 skips,four Swift Testing cases and zero failures. The later
observer/migration batch has separate current-source CI pending. No new TestFlight
submission, production operation or purchase occurs.

At the largest Dynamic Type setting on the same SE3, the first observer fails
because it requires a not-yet-realized offscreen amount before scrolling. The
captured review heading is at y654, below the viewport. No shipping layout is
changed to satisfy that assumption. Source `c7521e15` permits bounded reveal in
this explicit maximum-text check and queries scrollbar elements directly instead
of fetching every unrelated Other element. Geometry/action exclusion checks remain.

The corrected largest-text/dark partial-payment entry/review/discard passes in
106.5 seconds, zero skips. The combined amount row measures y401.5–562.5 inside
the y74–584 viewport, with full 161pt height/343pt width. Its screenshot is inspected.
Both original identities, 64 empty journals/settings/local privacy/first-use state
restore. Native Form/tab-bar blur and runtime frame warnings remain open; this
is not whole-page contrast, VoiceOver or phone acceptance. Shipping row code is
identical to the normal light/dark source; only test observers change.
