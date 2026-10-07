# Remaining root accessibility reports

The premise that remaining contrast reports require palette changes is not supported
by the retained audit geometry. The existing scripts/census-native-accessibility.py reads the actual seven reports
at e21d6b44: all three identified reports intersect the native tab-bar region; four
reports have no identified element or usable frame. This does not dismiss any report,
prove a false positive or establish accessibility acceptance.

No new audit runs, palette change, UI suppression or app mutation occur. The next
investigation must establish the anonymous elements and compare the identified text
when it is fully within the content viewport. Full unfiltered audits remain failed.
Continuous large-text reading, VoiceOver, Reduce Motion and both phones remain open.

Reproduce the diagnostic without running native actions:

```sh
python3 scripts/census-native-accessibility.py evidence/2026-10-07/swiftui-root-audit-census/issues.json
```

Earlier measured viewport comparisons already show the identified Today and Meals
findings move with proximity to the bar. Those recorded failures remain authoritative;
this census does not justify repeating them or infer identities for anonymous reports.

A separate current-source search finds no explicit SwiftUI animation or withAnimation
call in the shipping client. The two completion/check haptic calls occur only after
durable enqueue and an unchanged scoped-session check. This is source inspection,
not proof of physical haptic feel, VoiceOver navigation or Reduce Motion behavior
for Apple's native transitions. Those device criteria remain open.
