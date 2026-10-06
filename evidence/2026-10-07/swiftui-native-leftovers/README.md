# Native cross-week leftovers

The fictional saved-recipe dinner on 19 October remains unchanged. Alex adds one
leftover for 26 October Lunch through the native app. Both members read the copied
recipe through authorized native clients and open its rendered details. Sam then
removes only that leftover through its normal confirmation. Both members' final
native reads return an empty destination week. Removal preserves the entry,
copied recipe and both command receipts.

UI products are built from `a4739172c6491b514ed8cdb84d340c84f763cdc0`, with
1,132 frozen inputs, verified test origins, push disabled, actual signing and
three binary hashes. The GET-only native read products retain their real
`2bf22747eddaa9df62bd365ebb2dc799648ce97f` source. The only differences are the
meal action presentation, destination pickers, and two UI test files; domain,
authorization and the native read test are unchanged. Products are not relabelled
as a newer build. This work does not publish a beta.

Ten actual native methods pass with no skips: two original preflight reads,
Add, two placed reads, two rendered recipe reads, Remove and two removed reads.
The eight later methods and their terminal restoration assertions are in
[success](success/); the original preflight methods remain in
[first-native-failure](first-native-failure/). Six meaningful action screenshots
are directly inspected. Both canonical member readbacks match, apart from their
actor identity. All eight decoded raw-log hashes are checked. Controllers verify
original actor/household scopes, 64 empty journals, large/light settings and
local privacy/calendar/ingredient semantics after every invocation.

The eleven isolated PostgreSQL/PostgREST cases pass with zero failures/skips.
The first invocation without the required fixture-binary environment is a tooling
failure, retained in the preparation history, not a domain result.

[Independent hosted metadata](independent-hosted-verification.json) separately
confirms one Alex placement receipt and one Sam removal receipt, source revision
9 unchanged, target revisions 0 to 1 to 2, exact original/copied recipe snapshots,
and all eight protected source/library/grocery/financial fingerprints unchanged.
Privileged metadata is not the native authorization proof. No production data,
financial action, ingredient addition, preparation completion or model call occurs.

Eight failed native UI methods are retained without suppression. They stop before
Add: the compact menu target is 42 points, the symbol-labelled dialog duplicates
native buttons, the Meal picker is 34.5 points, a custom label fails to enlarge
that picker, and four observers fail at selection/transition/scroller handling.
The shipping fix uses plain native action labels and navigation-link destination
pickers. The observer waits for the actual selection value and names the modal
form; it keeps the 44-point and finite-geometry requirements. No committed Add is
repeated. The detailed failed sequence is in the dated progress history.

Two controller attempts stop before native invocation: a path concatenation error
before the placed read, then an exclusive-lock refusal during Alex's restoration.
The path is corrected and the lock is respected. An initial privileged removal
metadata read uses a nonexistent table name; the corrected read uses the existing
`nest_meal_removal_receipts` migration. All three are tooling errors, not passes.

Routine CI 37543537027 passes the UI source. Native CI 37543536999 is still running
when this evidence is written. This bounded normal-text simulator journey does
not close M5, maximum-text/VoiceOver/phone acceptance, live AI, push or release gates.
