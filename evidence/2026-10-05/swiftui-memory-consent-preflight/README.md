# Fresh private-memory consent and terminal recovery

Consent source `d96b9678f71c937be26afc770258de142dad990b`, followed by deadline UI
source `d6189131a0477b3adc28641b680bfe8da9d48649`, on the existing
`codex/swiftui-quiet-money` feature branch. M1–M9 remain incomplete.

The prior token-only gate stages new consent without a successful online approval
read. Two actual signed simulator regression methods fail with38 assertions at
parent57a237f8. Xcode finishes normally with65; this is intentional regression
proof, not a passing build. The earlier regression test version has1,042 input
hashes; the fixed source adds canonical-refresh tests and a Foundation test file.

The fix reads the known approval online, checks its exact identity/operation/text/
memory/revision and live deadline/status, then binds the decision atomically to
that same scoped SQLite proposal. Late account responses cannot stage consent.
A canonical reload changes only a confirmed proposal with the same terms. It
cannot replace an uncertain decision. Explicit dismissal clears only a terminal
or naturally expired confirmed proposal locally; it never invents a denial or
forgets a decision whose result is unknown. Existing exact lost-reply retries
remain separate from a new decision and do not require a new approval deadline.

## Completed local execution

- Eight focused Foundation methods: five new recovery tests plus three existing
  SQLite restart/isolation/import tests. Zero failures/skips.
- Eight actual signed iPhone simulator methods: six preflight/model tests, one
  existing full lost-proposal/save/removal-reply recovery method and one existing
  delayed decision/account-change method. Zero failures/skips.
- The new native tests cover offline approve/decline, ten stale/foreign changes,
  both permitted approval statuses, three real deadline encodings, sign-out/member
  changes during the read, canonical denied/consumed/expired refresh and failed
  reload without rebasing the saved text. Staging itself performs no POST.
- Core tests retain commands over restart, refuse foreign/changed refresh and
  consent, permit only explicit terminal/expired dismissal, preserve uncertain
  decisions, and enforce stale lease/member isolation.
- All1,043 native inputs match the Mac mirror. Strict Swift formatting, repository
  source limits and actual app signing pass. Split CSV manifests and bounded
  XCTest summaries preserve exact source/execution evidence without full logs or
  protected configuration.

Both exact-source CI workflows pass: Nest37260096733 and SwiftUI37260096762.
Actual full totals are496 Foundation methods/41 explicit skips and415 signed-native
methods/11 explicit skips, zero failures. Skips do not count as acceptance.

The real hosted maximum-length proposal/expiry UI journey completes. Native
keyboard automation hit watchdogs before any Review. Read-only SQLite/screenshot
checks prove no request was staged; the exact owned wedged session was explicitly
closed/reopened. Native Paste then succeeds, but the observer exposes only a512-
character prefix. Its first exact-field assertion refuses Review; a subsequent
attempt correctly cannot find the already-consumed Paste menu. No Paste repeats.
The continuation verifies the exact prefix/1000-character simulator clipboard,
clears the clipboard and presses Review once. Actual scoped SQLite and independent
test API reads now prove the entire1000-character command/proposal matches. This
is real native input, not API/SQLite presentation injection. API ownership checks
return partner/outsider403 and anonymous401; both active memory lists and complete
61-event histories/balances remain identical to the before baseline. Natural
expiry is04:05:28.981007 UTC; the one-off read-only observer reaches that deadline
with identical retained approval history, then terminates. No automation is created.

The signed deadline-only follow-up updates local presentation when the deadline
arrives. Its scoped task adds no request and preserves the existing row structure.
Strict format/limits and actual signed build-for-testing pass; that local build
is not another XCTest run. Its own Nest37261862852/SwiftUI37261862814 both pass:
496 Foundation/41 explicit skips,415 signed-native/11 skips, zero failures.
The updated app is opened into Private memory before the deadline (the real tool
output has both navigation selections before the04:04:07 UTC clock observation).
The long largest-text pre-expiry Save search subsequently becomes obsolete and
fails; it is not counted as a successful control tap. Read-only signature/source
inspection recovers the identity facts without reinstalling or repeating input.
The first held-open expired inspection, before any restart/reload, sees consent
absent and the full Discard control while retaining the same exact proposal.
Actual cold restart retains the same expired pending proposal. One largest-text
44pt corner Discard clears only the local slot; hosted status/approval history
stay identical. Both complete61-event histories (50+11 pages), zero balances and
empty active private-memory lists match the baseline exactly. Normal/light Today,
64 empty scoped journals, original data/Keychain and stable test origins/push-
disabled signature are restored. The simulator clipboard is cleared after Paste.

Full VoiceOver/motion/radio-loss/two-native-client/both-phone acceptance and live
Gateway generation/tool/stream behavior remain open. No model request, production
mutation, purchase, new beta, release, source merge or automation was performed.

## Current provider and delivery limits

A fresh read-only Vercel team metadata request confirms the intended
`drrius-projects` team and billing status active. The public response does not
expose card/payment-method verification, so it does not prove Gateway eligibility
or absence of a card. No key, budget, billing configuration or model call changes.
Last actual inference remains the recorded30 September customer-verification403.
PR85 is freshly OPEN/CLEAN at1c00a089, with no review conversations. Its only
Greptile review is the trial-credit-limit notice, not approval; the recorded
automatic-review merge exception remains pending. No duplicate review is requested
for an unchanged commit and no purchase is made to restore Greptile.
