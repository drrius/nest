# Calendar consent at maximum text — 30 September 2026

Actual fictional-account simulator taps found that the standard confirmation popup became narrow at maximum Dynamic Type: it split words and clipped the privacy explanation. Its semantic outside-dismiss target hit the middle of the popup and did not dismiss it; an inspected tap outside the popup safely cancelled. No enabling action was pressed.

The confirmation now uses a full-width native sheet with a scrollable explanation, explicit Enable/Cancel rows and a visible toolbar Cancel control. It explains partner/meal-planning access, on-device event details and that enabling alone does not publish anything. The existing authorized, revision-bound consent command remains unchanged.

Actual normal-app taps open the rebuilt sheet at default and maximum text. Default bottom Cancel returns to sharing off. At maximum text the privacy explanation wraps without the narrow-popup word breaks; scrolling exposes both action rows above the safe area. Tapping bottom Cancel closes the sheet. A fresh hosted status refresh completes without error and still reports sharing off. Enable and Publish were never pressed, and no financial command was used. The simulator is restored to light/large.

- [Before: narrow maximum-text popup](before-max-confirmation.png)
- [After: default sheet](after-default.png)
- [After: maximum-text privacy explanation](after-max-top.png)
- [After: reachable maximum-text actions](after-max-actions.png)

Strict Swift formatting, source limits and actual signed app checks pass. The full native target builds; three existing native tests pass with no skips (0.190 seconds), covering lost opt-out recovery, account-change invalidation and refusal to publish after consent revocation. These tests use controlled transports. The actual sharing-off refresh uses the isolated hosted API. [Metadata](verification.json) binds the exact rendered source hash, simulator and results. New-source CI is pending.

This is bounded consent presentation/cancellation QA, not a real enabling/publishing/permission-loss journey, partner snapshot acceptance, VoiceOver or phone verification. No new beta was submitted. Internally available build10 remains source `127c34fa` and lacks this and the two later expense layout fixes. Production, purchases and APNs delivery are unchanged.
