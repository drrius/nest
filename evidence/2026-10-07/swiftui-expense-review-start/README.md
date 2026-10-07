# Expense review starts at its beginning

The previous native split checks show that switching from a deeply scrolled form
to its review retains the lower scroll position. ExpenseScreen now gives its
native Form distinct draft, review and saved identities. Draft state remains in
ExpenseScreen, so rebuilding the Form does not discard the entered fields.

The first largest-text check at d097752d uses a long description and fails the
immediate-amount assertion. It restores both member scopes, 64 empty journals,
original settings and local semantics. That failure is retained; it does not
establish whether top reset failed, because the long text may fill the viewport.
The corrected 8d03135f fixture uses the short literal description QA and captures
geometry before asserting immediate amount visibility. Long-copy reading remains
a separate acceptance item, not removed from scope.

Fresh signed preparation matches all 1,142 inputs, public test origins, disabled
push, build 19 metadata and compiled product hashes. Alex's largest-text check
passes in 110.945 seconds with zero skips: CHF 1.01 is visible without any scrolling,
Edit restores description QA and amount 1.01 at the form beginning, Back requires
explicit Discard, and both original clients/settings/local semantics restore.
Sam's largest-text method passes in 111.084 seconds and Alex normal-text passes
in 45.821 seconds, all with zero failures/skips. Each completed method restores
both original scopes, 64 empty journals, settings and local semantics. Actual
amount geometry is x32/y457.5/203.5 by 63.5 points, entirely within the 510-point
viewport for both maximal clients. One maximal screenshot is directly inspected.
Final privileged metadata matches all eight protected digests. Candidate routine
CI passes d097752d; its native CI 37570191489 now passes. Corrected observer 8d03135f shares identical
shipping code and is pushed in the later source1832fd29. The latter adds a
continuous largest-text explanation check; the additional Alex maximal method now passes in112.421 seconds with zero skips.
The exact financial explanation is343 points high versus a510-point viewport,
so read() asserts its full frame after reveal rather than invoking two-boundary
coverage. Raw diagnostics retain its preceding offscreen frames. Both scopes,
64 journals/settings/local semantics restore. No direct final paragraph screenshot
is retained by the short-text helper; longer description/copy and VoiceOver
acceptance remain open.
No financial Save is selected. HTTP requests are not measured, so this does not
claim zero POSTs or native authorization proof. No release, inference, production
operation or merge occurs. This change is not in TestFlight build 19.
