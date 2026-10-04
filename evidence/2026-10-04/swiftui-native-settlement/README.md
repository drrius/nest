# Native partial/full payment, stale review and exact retries

On 4 October 2026, the signed SwiftUI app recorded a fictional one-cent partial
payment, retained its exact receipt through process restart, refused an outdated
full-payment review after a real partner API change, and recorded only the freshly
reviewed CHF1.01 remainder at maximum text size. Both members finish at zero balance.
Exactly three new append-only test entries remain; no actual money was transferred.

## Source and scope

The payment journeys ran at shipping native source `177d0a70`, previously passing
[Nest37205046774](https://github.com/drrius/nest/actions/runs/37205046774) and
[SwiftUI37205046782](https://github.com/drrius/nest/actions/runs/37205046782):491
Foundation cases/41 explicit skips and409 signed-native cases/11 explicit skips,
zero failures. [Provenance](provenance.json) verifies all1,041 original native inputs,
strict installed signing, the retained executable and stable isolated test origins.
The original manifest is retained in the [PDF evidence](../swiftui-native-pdf-receipt/native-inputs-1.csv)
([part2](../swiftui-native-pdf-receipt/native-inputs-2.csv), [part3](../swiftui-native-pdf-receipt/native-inputs-3.csv)).

The owned SE3/iOS26.3 simulator is `C3ABC0D4-CFD4-4F23-8CC3-0E542014803A`.
Its fictional Test Alex account and Test Sam partner belong only to nest-test
household `be772ffd-3ab5-41d5-8438-647a79a553da`. No production project, phone,
release, purchase, worker or live model was used. Temporary observer/verifier
[input hashes](verification-inputs.json) are separate from shipping/native-CI proof.

## Observed financial journey

1. Both independent authenticated members read the same complete52-entry history
   and CHF1.03 balance. The native partial review contains the correct payer,
   recipient, date and explicit fictional/no-transfer note.
   [Baseline](before-balance.json), [review](partial-review-top.png).
2. One native corner Save at356,451.5 targets a343×52pt control and records exactly
   one centime. [Intent](partial-save-intent.json), [durable receipt](partial-result.json),
   [recorded screen](partial-recorded.png). Both members see53 entries and CHF1.02
   outstanding; their detail deltas are exactly−1/+1. Only the recording member
   recovers the operation receipt; partner recovery is unresolved/null, outsider403,
   anonymous401. [Hosted proof](partial-verification.json).
3. Actual terminate/launch and native reopening retain the identical command and
   recorded receipt. Native receipt navigation opens the correct entry and its
   signed centime shares, then returns to the same recovery. Done clears only its
   terminal slot. [Restart](restart.json), [reopened receipt](partial-after-restart.png),
   [detail](partial-native-detail.png), [shares](partial-native-shares.png).
4. Native full review retains CHF1.02. One normally authorized partner API partial
   payment of one centime creates the intended race:54 entries/CHF1.01 outstanding.
   The recording partner alone can recover its receipt; both members read the same
   shared entry. [Original review](full-before-race.png), [partner proof](race-verification.json).
5. One native Record attempt refuses the outdated review, keeps its original
   CHF1.02/pair/date/note and shows explicit reload guidance. All64 scoped journals
   remain empty; both histories retain exactly54 entries. This establishes no
   staged intent or new event; no network tracing/no-POST claim is made.
   [Refused review](stale-refused.png), [intent](stale-save-intent.json).
6. Explicit reload and review retain the note and use CHF1.01. Maximum-text/dark
   amount and controls are inspected. One native corner Save at356,100.5 targets
   the343×155.5pt control and records exactly101 centimes.
   [Fresh review](full-reloaded-review.png), [large amount](full-largest-terms.png),
   [large controls](full-ready-review.png), [intent](full-save-intent.json),
   [receipt](full-result.json). Both members read55 entries, equal shared details,
   exact−101/+101 deltas and zero balances; receipt recovery remains owner-only.
   [Final hosted proof](full-verification.json), [balance](final-balance.json).
7. An independent API retry sends the identical already-recorded native command,
   returning the identical receipt despite the now-zero balance. A changed-note
   retry with that operation ID returns400 invalid_request. The original receipt,
   exact52 original plus3 expected new events, and zero balances remain unchanged.
   [Exact/changed retry proof](full-replay-verification.json). These are API checks,
   not native lost-reply or radio-loss execution.
8. Normal maximum-text Done clears the terminal recovery; the settled-up state has
   no new Record/Review action. Its527.5pt copy exceeds the514pt body, so two actual
   overlapping scroll positions cover the whole message. Reload is fully above the
   tabs. [Recorded status/Done](full-finish-ready.png), [copy start](settled-largest-start.png),
   [copy end](settled-largest-end.png), [coverage/target](zero-final.json).
   Normal/light Today and all64 empty scoped journals are restored without removing
   app data/Keychain. [Restoration](restored.png), [journals](restored-journals.json).

Direct read-only SQL compares all52 original event rows, their allocations/ledger
rows and claimed Storage rows by exact scoped digests. Every before/after digest
matches. [Retention proof](retained-history.json). The new append-only entries are
deliberately excluded from those original-row digests and are never deleted/reset.
Actual accessibility metadata is retained in each `*-nodes.csv`; scoped phase
counts/statuses are in [native states](native-states.json).

## Wording correction and separate updated build

The original detail explanation could imply that every negative change creates
debt. The replacement says positive means owed more or owing less, and negative
means owing more or owed less. No centime, command, authorization or domain rule
changes. This is the only changed file among the1,041 native inputs.
[Source binding](wording-source.json).

Strict full Swift formatting/source limits and a new signed Mac build pass.
Installing over the same app preserves its scope/data/Keychain. Opening the actual
recorded CHF1.01 entry from native history renders the corrected explanation and
exact−1.01/+1.01 shares. [Build](wording-build.json), [installation](wording-installed.json),
[actual corrected detail](wording-detail.png). Both complete55-entry histories and
zero balances remain unchanged. The updated app returns through Back to Money root,
then ordinary Today with64 empty journals. [Final updated app](wording-restored.png),
[state](wording-restored-state.json). No new local unit test run is claimed for this
copy-only change; current-head CI is recorded separately when it finishes.

## Observer corrections and limits

No successful payment Save, partner command, retry probe or Done was repeated.
Observers were corrected for the root's `Record a payment` label, a text-input
commit report contradicted by freshly observed exact0.01, cell-inherited button
labels, the native Back previous-screen title, a too-short maximum-text scroll
budget, and an impossible whole-tall-cell single-frame assertion. API observers
were corrected for description casing, `kind`, mandatory null recovery receipt,
and the SQL result's nested `snapshot` wrapper. The actual expired verifier session
stopped before POST; only the three existing fictional verifier sessions were
renewed. Original native sessions were not replaced.

Native lost-reply/cancellation variants, broader membership/concurrency cases,
private AI approvals/live provider, full VoiceOver/haptics/radio loss, two native
clients and both phones remain open. No full financial, accessibility or M7
acceptance is claimed; all other unchecked milestones remain incomplete.
