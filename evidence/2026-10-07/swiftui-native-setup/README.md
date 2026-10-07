# Native optional setup journeys

The optional setup screen now separates explanations from interactive labels.
At the largest accessibility text size, its former food link was 861 points high
inside a 510-point usable viewport. The full label could not be exposed for a safe
tap. Titles and saved-choice status remain in the links; explanations remain visible
as static text or section footers. No font, wording or preference semantics changed.

Both fictional members open Profile → Your setup → food, cooking, Calendar and
notifications, read the explanations, return without editing, use Get started and
return to Today. Both normal/light and maximum/dark journeys pass on source
`b7aea8ba4912efdf15420926c3f615d474bdc5c8`. Controls require measured whole-target
visibility and at least 44 points. Long static explanations use overlapping reading.
These are navigation checks, not saves, first-use onboarding completion or permission
acceptance. Get started entered through Profile dismisses setup without persisting
first-use choices.

The before/after authenticated native SDK reads use the retained, unchanged
`dad2f4be2032c4806bbc3ff1b203fbdc5eb8d0e2` SDK products. Explicit source identities
and binary hashes are preserved separately from the fresh UI products. Alex has
saved food/cooking/notification records; Sam has saved cooking only. Saved choices
mean a record exists, not that notifications are enabled. The native transport allows
only fixed-origin GET requests. No test uses a privileged server key.

Independent privileged metadata reads confirm exact before/after food, cooking and
notification rows and command receipts, plus eight protected source/library/grocery/
financial fingerprints. This supplements the native authenticated reads, not their
authorization proof. Each completed execution restores both scopes, 64 empty journals,
display settings and local privacy/calendar/ingredient/first-use semantics.

`first-native-attempt` retains the original successful reads/normal journeys and the
861-point action failure. `offscreen-status-failure` retains the subsequent failed
observer that waited on an unrealized cooking row. The corrected observer reveals
rows before checking their saved status. No failed attempt is relabeled successful.
Raw log gzip files retain decoded SHA-256 values. Safe JSON/text/image attachments,
source inputs, product identities and exact controllers are in `success`.

Routine CI [37551574018](https://github.com/drrius/nest/actions/runs/37551574018)
and native CI [37551574034](https://github.com/drrius/nest/actions/runs/37551574034)
pass at the UI source. Native CI executes 506 Foundation tests with 41 skips,
473 signed-app tests with 41 skips and four Swift Testing tests, with zero failures.
The opt-in hosted journeys above are separate executions, not routine CI coverage.

This does not close M3 or full accessibility/design acceptance. No model inference,
permission grant, APNs enrollment, beta publication, merge or production operation
occurs in this pass. Shared four-tab header and padding remain available in build 19;
the setup explanation change is later source work.
