# Current Calendar root accessibility audit

One actual signed SwiftUI Calendar audit ran against the separate nest-test API
on the owned SE3 simulator at large text/light appearance. It used the existing
unrequested Calendar permission without granting or changing it. No household
command, model request, financial write or beta submission occurred.

The current full audit fails with one contrast finding and zero suppressed issues.
The identified unknown-availability paragraph is at y599.5–664, beneath the native
tab bar starting at y584. The [full viewport](viewport.png) and [issue crop](finding-crop.png)
were inspected. [Finding](finding.json) and [result](result.json) retain the failure.
The audit reports no font-size, clipping, target or trait findings in this run.
This supersedes the older Calendar initial-viewport finding list only for this
source, permission state, text size and appearance. It does not establish that all
text sizes, permissions or scrolling content pass.

The earlier 5 October Calendar result predates the shared root card/layout change.
Its font-size/clipping reports are historical evidence, rather than confirmed
current failures. The existing controlled fully-visible paragraph reading and
contrast checks retain their separate limits. A new full audit is still failing,
so no accessibility gate is closed or issue suppressed.

[Source](source.json) identifies the unchanged shipping/audit files. Original
member scopes, 64 empty journals per client, display settings and local privacy
choices restore; [restoration](restoration.json). VoiceOver, Reduce Motion,
populated calendars, both phones and owner design acceptance remain open.

The rerunnable [position census](contrast-census.py) compares retained historical
and recent identified contrast reports without rerunning UI or suppressing issues.
Its [output](contrast-census.json) places all eight recent Calendar/Meals/Money
reports below the native tab bar. Older source reports also include above-bar and
unidentified elements, so this is a source-bounded observation, not a blanket
platform diagnosis. Earlier color/fade/background experiments failed; no further
palette workaround follows from this count. Full audits remain failed.

A subsequent reversible Calendar viewport-clipping experiment runs the same full
audit against the same permission/text/appearance state. It fails with the same
one contrast finding at the same bounds. The clipping modifier is removed from
Linux and Mac source; it is not presented as a fix. The pre-experiment stable-origin
signed client is reinstalled and its original scopes/settings/privacy verified.
No issue is suppressed and no hosted command or permission change occurs.
