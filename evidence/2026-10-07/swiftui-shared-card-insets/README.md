# Shared root card insets

Root-card padding now comes from QuietTabLayout.cardInset20pt. Today meal,
calendar, approval, due-bill and grocery cards previously used18pt; meal-day cards
used16pt horizontally. They now share20pt with Calendar's QuietSectionCard and
Money's balance/action cards. Outer20pt page padding,14pt top inset and root-header
anchors are unchanged. No data or navigation behavior is added.

Signed build-for-testing passes. One normal-text Alex SE3 native check passes
without skips: identity, Today meal-link x40/right40 alignment, complete44pt target,
actual Meals navigation and return. The screenshot is directly inspected. Both
original identities,64 empty journals, settings and device-only choices restore.
No save, decision, permission, provider or canonical mutation occurs.

This method proves the realized Today meal card, not every changed conditional
card or all meal-day text sizes. Largest-text meal-day width and whole-root
accessibility/phone acceptance remain. Shipping changes are later than build19;
current-source CI is required after push.

The changed meal-day width now also passes one largest-accessibility-text/dark
SE3 native method without skips. It measures a realized empty Dinner slot at
x40/right40, verifies the complete44pt target, opens the actual Add meal sheet and
uses its native Cancel without Save or an unsent-discard prompt. The same empty
slot remains. The screenshot is inspected. Both original scopes,64 empty journals,
settings and device-only choices restore. This verifies one empty slot/editor
handoff, not populated recipe rows, all conditional Today cards or phone acceptance.
