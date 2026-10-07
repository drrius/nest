# Native financial category preflight

Fresh expense and replacement-expense correction approvals now confirm their
category through the current authenticated single-category read before creating a
durable decision. Missing, offline or foreign metadata cannot stage approval.
Decline does not require category access. Expiry and account generation are checked
again after the category network boundary. Existing saved decisions recover with
their original immutable terms, without adding a category prerequisite.

Eight focused signed-app XCTest methods pass without skips. The new method covers
ten cases across expense/correction: missing, offline, foreign and valid category
approval, plus decline during category outage. Real isolated SQLite journals are
empty for refused decisions and present only for the valid approval or decline;
the controlled transport accepts GET only. Existing lost-reply, expiry, exact
proposal and account-switch suites still pass. These are native session-model
tests, not rendered failure/retry interaction or hosted financial mutations.

The first command used a nonexistent NestTests target and failed before building.
The corrected NestAppTests run exposed eight assertions in the new method because
its synthetic deadline omitted the contract's required six-digit fractional time.
The seven existing methods passed in that run. Correcting only the synthetic
timestamp yields eight passing methods. No shipping timestamp parser was weakened.

Strict Swift formatting, source limits and diff checks pass. Repository formatting
and current-source CI are recorded when committed/pushed. No hosted proposal,
decision, financial record, provider invocation, production operation or release
was created. The earlier consent/decline fixtures are not replayed.

The delayed category boundary now has a separate account-switch check for both
expense and correction approval. The controlled server pauses the category reply,
the native session signs in as the other member, then the old reply is released.
Both staging tasks fail signedOut; neither expense nor correction journal belongs
to the new member. The transport still permits only GET, so no decision is sent.
The ten earlier category cases and two switch cases pass as two XCTest methods,
without skips, on a newly isolated simulator. It is retained and shut down afterward.
Both original hosted QA app origins remain unchanged and push remains disabled.
This proves the native session/SQLite race, not physical sign-in or a rendered race.
