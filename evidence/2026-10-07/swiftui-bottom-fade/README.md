# Native bottom scroll effect

Removing the iOS 26 bottom scroll effect improves the Calendar heading contrast.
The native floating tab bar, Quiet colors, header and spacing remain unchanged.
The implementation uses Apple's
[scrollEdgeEffectHidden API](<https://developer.apple.com/documentation/swiftui/view/scrolledgeeffecthidden(_:for:)>),
which removes the effect entirely. The earlier unsuccessful hard-style experiment
changed its appearance instead. iOS 18–25 keep their existing rendering.

One fresh unfiltered Calendar baseline uses independently verified retained
`a4739172` UI products and reports the same two contrast findings as the preceding
Calendar audit. Fresh candidate `e21d6b44` compiles all 1,132 inputs and runs the
same unfiltered method. It reports only the availability paragraph beneath the
tab bar; the heading at y549.5 no longer fails. Results finish in 25.084 and
24.814 seconds respectively. Both methods fail overall. No report is suppressed.

Three further unfiltered candidate methods finish in 42.071 seconds. Today retains
two named near/below-bar contrast reports; Meals and Money each retain two
anonymous contrast reports. The current four-root candidate therefore has seven
contrast reports and no reported font/control/description/clipping/trait finding.
All four full audits fail. This is not full accessibility acceptance, closure of
unmatched historical anonymous reports or proof of their identities. Eight full
screenshots/crops are directly inspected. No darker/larger-text or phone execution
is claimed for this change.

Both source maps contain 1,132 inputs. Exactly five shipping UI files differ, as
listed in [the source comparison](source-comparison.json). Source limits and
configured Mac formatting pass; origins, push disabled, actual signing, selected
products and three binary hashes are verified. Each controller restores both
original member/household scopes, 64 empty journals, actual large/light settings
and local calendar/privacy/ingredient semantics through ordinary foreground
launch. Three decoded raw-log hashes and all restoration assertions are checked.
No Save, household/financial command, model call, calendar permission change,
production action, merge or beta publication occurs.

The preceding leftovers UI source `a4739172` now passes native CI 37543536999:
506 Foundation tests/41 explicit skips, 471 signed-app tests/39 explicit skips
and four Swift Testing cases, all with zero failures. Strict formatting/limits,
signing and guarded UI compilation pass. [CI evidence](leftovers-native-ci.json)
records that source and decoded public log hash. It does not verify this candidate.
Candidate routine CI 37544880908/native CI 37544880800 are still running when
this record is written. Actual phone acceptance, remaining contrast reports,
live AI and push remain open.
