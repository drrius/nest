# Native Calendar permission and empty read — 30 September 2026

The same clean Nest-only simulator used for earlier QA began at not-requested Calendar access. Using the owner's explicit approval for full access on this simulator, actual normal-app taps opened iOS's real permission prompt and selected Allow Full Access. No additional owner approval was requested. This did not grant access on a phone or the Mac's personal Calendar account.

The native picker lists the simulator's built-in Birthdays, default Calendar and US Holidays sources. Only the default Calendar was selected for local display. Its actual native switch changed 0 → 1; reopening later retained 1. The current-day EventKit read showed no events, explicitly warned that this does not establish either member's availability, and kept partner availability unknown. [Actual native rendering](selected-empty-calendar.png) is an empty read, not populated-event acceptance.

The display choice was restored using the actual switch (1 → 0); closing the picker returned to explicit calendar-choice copy. A final fresh hosted sharing-screen load still reports sharing off. No consent Enable, Publish, financial command or EventKit record creation/edit/removal was used. Calendar permission remains granted as authorized for subsequent clean-simulator QA; appearance/text remain light/large.

Two automation selectors initially failed: the parent switch-row tap hit its label, and a broad Done label matched both navigation and button nodes. Retargeting the actual switch and fresh exact Done button completed the flow. These are recorded harness corrections, not weakened assertions or product fixes. [Metadata](verification.json) retains the exact boundaries. The hosted API remains the unchanged isolated `8fbe67d8` deployment. No source, beta or hosted deployment changed; native source `80474da1` and backend cleanup `51cae3ef` have separately recorded passing CI.

Phone permission/Apple sign-in, populated/complex EventKit events, actual permission-loss cleanup, two-member publication/opt-out/freshness/privacy and VoiceOver remain incomplete. This pass does not close M6.
