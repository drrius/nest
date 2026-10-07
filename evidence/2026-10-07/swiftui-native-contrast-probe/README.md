# Native contrast diagnostic

Premise tested: Nest's text colors cause its current contrast finding below the
native tab bar. The existing [position census](../swiftui-current-calendar-audit/contrast-census.json)
places all eight recent identified findings below that bar; previous color, fade,
background and clipping changes did not clear them.

Three actual contrast audits now run in a standalone SwiftUI app on two separate clean
iPhone SE simulators, iOS 26.3.1, large text/light appearance. The app uses system
colors, ScrollView, NavigationStack, Text and TabView. It has no Nest domain/client
sources, authentication, networking, persistence, personal data or permissions.
The current Nest project is reused only as audited Xcode target metadata, with
packages, entitlements, domain/unit targets and SQLite linkage removed.

| Case                                       | Strict contrast failures                      | Other contrast findings                     | Result |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------- | ------ |
| Native tabs, default bottom fade           | Section 4 and Paragraph 4, both below the bar | Three secondary-text nearly-passed findings | Failed |
| Same scroll content without tabs           | None                                          | Four secondary-text nearly-passed findings  | Failed |
| Native tabs, bottom fade hidden as in Nest | Paragraph 4 below the bar                     | Three secondary-text nearly-passed findings | Failed |

All paragraph coordinates are identical across cases. Paragraph 4 occupies
[40, 629.5, 267.5, 64.5]; the native tab bar begins at y584. Removing the bar changes
its report from strict failure to the same nearly-passed finding seen on the other
standard secondary labels. The default primary heading Section 4 at y597 is
flagged only with the default native fade. Hiding that fade removes the heading
finding but retains the below-bar paragraph failure. This matches Nest's current
scroll-edge setting without using Quiet colors or domain data.

[Raw observations](observations.json), [no-fade observations](no-fade/observations.json)
and the rerunnable [comparison](comparison.json) preserve all findings.
The [tabs viewport](native-tabs-viewport.png), [plain viewport](plain-scroll-viewport.png)
and [no-fade viewport](no-fade/viewport.png) were visually inspected.
No issues are suppressed and no failure is turned into a pass. Initial
[summary](test-summary.json) has two failures; the selected additional
[case](no-fade/test-summary.json) has one. Neither original case is rerun.

This demonstrates that unmodified native controls can produce the same class of
below-bar contrast failure, including with Nest's bottom fade hidden. It does not
prove every Nest contrast issue is a framework defect or false positive, clear
historical above-bar findings, establish VoiceOver behavior or close M1. The gray
secondary-text findings remain failures. Fully visible content and physical-phone
readability/accessibility still require acceptance. No shipping palette or
navigation workaround follows from this result.

The exact initial [source](initial/Probe.swift) and [test source](initial/ProbeTests.swift)
match [Mac input hashes](actual-input-hashes.json). The extended current sources
match the [no-fade hashes](no-fade/actual-input-hashes.json). Swift formatting and
file/function/complexity limits pass. Both separate simulators are deleted.
[Initial cleanup](cleanup.json) and [additional cleanup](no-fade/cleanup.json)
compare exact hashes of original actor/household scopes, 64 empty journals per
client, application paths, display settings and private device choices. They match;
no repair, relaunch or clearing of the original clients occurs.

The preparation and execution scripts are retained for review and repeatability.
Prepare in a fresh owned temporary directory with `prepare-project.py`; on this
authorized Mac, `run-probe.py` uses the existing read-only original-state helper.
It refuses existing results, holds the native actor lock and cleans up its new
simulator. The added case is selected explicitly rather than rerunning completed
audits. `analyze-probe.py` recomputes the comparison from exported observations.

Build 22, backend data, permissions and credentials remain unchanged. No household
command, model request, migration, beta submission, purchase or merge occurs.
