# Fully visible affected-row contrast comparison

Source `35bc7a95` prepares two read-only native audits. Meals reveals the identified
Tuesday breakfast/Add meal action; Money reveals the retained expense row following
the newest payment. Each requires the complete row above the native tab bar before
capturing geometry and running an unfiltered accessibility audit. No item is tapped,
changed or posted. The source-matched signed build passes; the audits are running.
Meals completes with a failed unfiltered audit and four contrast reports. The
required Tuesday breakfast action is fully visible at y346–406, above bar y584,
and absent from those reports. The reported Breakfast/Lunch/Add meal text is now
at y606/666.5, behind or below the bar. The actual screenshot is inspected.
This establishes that reported contrast moves to other obscured rows; it does
not clear the full Meals audit or prove hardware accessibility.

Money's initial observer incorrectly queried the native history action as a link;
the captured hierarchy exposes buttons. Its bounded run fails before auditing and
restores both original scopes/64 journals/settings/local choices. Source
`571d5257` corrects that type, and the following source adds a15-second existence
check before scrolling to avoid repeated absent-element scans. No passing Money
audit or finding closure is claimed yet.

Original two-member scope, 64 empty journals, display settings and local privacy
choices must restore. Every audit finding remains recorded. The older anonymous
reports are related only by visible region, not inferred exact node identity.
This check cannot establish VoiceOver, either phone or whole-app acceptance.

The corrected Money method completes at `fbb811d8` with a failed unfiltered audit
and three identified contrast reports. Its required retained expense action is
fully visible at y307.5–386.5; the reports instead identify the PDF expense title,
amount and date at y602.5/651, behind/below the584pt tab bar. The actual screenshot
is inspected. The target row is absent from these reports. Both original clients,
64 journals, display settings and local privacy choices restore. Meals is not
repeated. The earlier observer failure remains retained, and neither full audit
is called passing. No native write or UI palette/layout change occurs.
