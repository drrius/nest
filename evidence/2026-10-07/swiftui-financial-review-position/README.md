# Financial review position

Source `a00f7d18` gives settlement, refund, correction, recurring-rule editing,
variable-bill and resumption Forms distinct draft/review/saved identities. State
remains on the enclosing screen; the native Form resets its scroll position when
changing phase. This follows the already verified expense-screen behavior.

The first owned SE3 check at `1dd4959f` fails because the test expected a standalone
amount label; the native review combines it as "Amount, CHF 0.01". Its actual UI
tree also shows the review heading at y56–96.5 across the navigation boundary y74.
The selector is corrected, and the heading visibility assertion is added. The
failure is retained rather than reported as a failed amount calculation.

At `a00f7d18`, four selected methods pass: payment note keep/discard/pristine Back,
refund note keep/discard/pristine Back, correction review keep/discard, and full
payment review/Edit with the retained note. The review heading is now at y221–261.5
and its amount at y365.5–417.5, fully inside the y74–584 viewport. The attached
review screenshot is inspected. No Record/Save/Confirm money action occurs.

The fifth method refuses to tap the collapsed amount picker, whose target measures
34.5 points tall. Source `e02e47e2` enlarges it, which passes, but the popup option
exposes a 42-point target. The method refuses to tap it. Source `2eb6bd07` uses an
inline native Picker with 44-point option frames instead. Strict compilation and
the selected partial-amount entry/review/discard method pass with zero skips. The
option is measured before tapping; the 44-point requirement remains enforced.
The four passing flows are retained without another invocation.

All completed controllers restore original identities, 64 empty journals, display
settings, calendar/privacy and first-use state. The first fixed preparation fails
strict formatting because a directory was supplied without --recursive; correcting
the controller flag resumes the frozen inputs before any UI action. Source formatting
and limits pass. Financial/grocery/meal fingerprints are recorded before the checks;
post-check comparison is exact for all eight protected fingerprints, including
62 financial events, 104 allocations and 124 ledger rows. Balances remain derived
from the unchanged ledger.

The retained runtime warnings about nonfinite frame dimensions remain unresolved.
This verifies selected normal-text fictional native interactions, not large-text,
VoiceOver, recurring review rendering, successful payment posting, either phone or
full M7 acceptance. These changes follow the delivered build20 and are not a new
TestFlight submission. Current-source CI is pending. Five different normal-text
methods have passing evidence across the recorded sources. There is no claim of
five passes on one source.
