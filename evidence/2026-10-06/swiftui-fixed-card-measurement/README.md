# Fixed Calendar content measurement

Quiet cards and Calendar's fixed sections now use regular stacks. They retain
the same fonts, colors, padding, actions and privacy rules. This follows
[Apple's container guidance](https://developer.apple.com/documentation/swiftui/picking-container-views-for-your-content):
start with standard stacks and use lazy stacks when profiling justifies them.

The card-only candidate `ffc76186` runs one unfiltered five-method root audit.
All five methods fail, with 13 reports: eleven contrast and two repeated font
reports for the partner-availability heading. The access-button, Full Access
explanation and anonymous font reports do not recur. This is a count/observed
identity change, not closure of every historical anonymous report.
All 1,129 source inputs, signed fresh products and actual compiled card/audit
sources are verified. Seven root/restoration images are directly reviewed.
The controller's process-termination guard fails in restoration; its failed
terminal record is preserved. A separate ordinary launch verifies both original
scopes, 64 empty journals, settings and local semantics. [Card-only records](card-only/summary.json).

The combined candidate `79de03f9` changes Calendar's outer fixed sections too.
Its two native Calendar methods finish in 34.710 seconds: the Dynamic Type,
hit-region, descriptions, clipping and traits check passes; the full audit fails
with two contrast reports and no font report. No report is suppressed. The
contrast reports identify the partner heading near the floating bar and the
availability paragraph beneath it. All 1,129 inputs and fresh products are
verified; five images are directly reviewed. Original scopes, journals,
settings and local semantics restore normally. [Combined reports](combined/issues.json).

The old largest-text observer fails in 43.052 seconds because it demands a
559.5-point paragraph fit wholly in the measured 510-point viewport. Its twenty
observations and screenshot are preserved. Fonts are not shrunk. A new guarded
test reuses the existing continuous text reader, requiring overlapping beginning
and ending coverage for tall static text and full visibility/minimum 44 points
for the access button. Its first attempt at `788f4636` fails before a scroll:
pan diagnostics request an absent native navigation bar's identifier. The
controller restores normally. [First-reader failure](first-reader-failure/summary.json).
The diagnostic is corrected to record an absent bar without querying it.

The corrected diagnostic at `ef30a9c6` passes in 58.831 seconds, restores both
scopes/settings and exposes the complete 295×187.5-point access button. However,
its viewport begins at y0 and includes status chrome. The 559.5-point paragraph
fits that oversized viewport, so no overlapping coverage branch runs. That pass
does not establish continuous reading below the status bar. The bounded fixture
now asserts the real 375×667 screen, excludes the top 40 points (captured status
region ends at y20), and captures both paragraph views explicitly.

The bounded method at `c7253898` passes in 69.325 seconds. Its actual reading
viewport is `[0,40,375,544]`. The 559.5-point paragraph has 522 points covered in
the beginning capture and 542 in the ending, overlapping by 504.5 points. Both
boundaries and all text are directly reviewed; the other paragraph is fully
visible. The enabled/hittable access button is 295×187.5 points and fits fully
above the tab bar. Eight measured finite pans avoid actions and scroll bars.
All seven PNGs are directly reviewed. The complete 1,130-input source map and
raw-log hashes match; original scopes, 64 empty journals, large/light settings
and local semantics restore. [Bounded verification](bounded-reader/verification.json).

These are isolated real native checks,
not live AI, physical-phone or full accessibility acceptance. No permission is
granted, fixture created, financial command issued or model called. Raw result
bundles and excluded binary/video attachments remain private on the Mac.
