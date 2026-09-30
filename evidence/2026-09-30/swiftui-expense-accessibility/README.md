# Expense labels at maximum text — 30 September 2026

Actual review scrolling reached both Save and Edit at maximum Dynamic Type. Edit retained the fictional draft, but visual inspection found “Shared amount (CHF)” truncated by the Form cell. The field caption now explicitly allows unlimited lines and its full vertical size. This one-line layout change does not alter draft parsing, allocations or saving.

The rebuilt signed iPhone 17 Pro/iOS26.3 simulator app shows the complete CHF label on two lines. A fresh unsaved CHF1.01 review retained exact 51/50 centime shares in light/dark mode. At maximum text, real scrolling brings both action labels above the tab bar; tapping Edit returns the description and amount intact. Save was never pressed. A final hosted read confirms all 13 financial events and their full event/allocation/ledger fingerprint unchanged. The first temporary harness stopped on covered accessibility nodes; its corrected selector requires uncovered buttons, and the final interaction/screenshot checks pass. That harness issue is separate from the visually confirmed label truncation.

- [Before: truncated field caption](before-max-form.png)
- [After: complete caption and preserved draft](after-max-form.png)
- [Uncovered Save/Edit actions](review-max-actions.png)

Strict Swift formatting, source limits, full Oxfmt, diff checks and the signed native build pass. No mirrored unit test was added for this reversible layout fix. New-source CI is pending. The previous native-test source `10f0c6af` passed both workflows; `2080ab66` passed routine CI for the stronger diagnostic assertion and evidence. [Metadata](verification.json) binds the changed file hash and bounded observations.

This is a fictional simulator form/review check, not saved-financial-command, VoiceOver, full maximum-text form-control, long-member-name or physical-phone acceptance. Appearance/content size were restored to light/large. Build10 on TestFlight remains exact source `127c34fa`; neither later expense fix is included, and no new beta submission was made.
