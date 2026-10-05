# Fresh native recipe write boundary

Status: write preflight/edit refresh pass CI; normal and maximum-text unsent draft checks pass on the simulator.

Recipe creation, editing and archiving previously staged from the form-opening
library revision. New intent now requires a live authorized library read with the
same revision and unchanged account generation. Edit/archive also read and compare
the exact displayed recipe, including ingredient identity/content. Each async read
has account/generation guards; the scoped SQLite lease remains the final local
account boundary. Server version/authorization checks still arbitrate later races.
Already staged uncertain operations keep their existing exact retry identities;
preflight does not regenerate or invalidate them.

The new-recipe form exposes Refresh saved meals after a refusal as well as an
initial context failure. Refresh replaces context without resetting any typed
fields. Discard uses the short native alert, whose complete normal and maximum-text rendering has been visually inspected. A creation accepted into uncertain recovery is not claimed as a
confirmed server save.

Thirteen new AppTests cases cover unavailable libraries before staging, changed
revisions, changed edit/archive content at the same revision, account switches
during held reads, new-recipe fresh-context recovery using the same draft, and editor refresh that
preserves a typed patch when only the library revision changed. Refresh refuses
a changed recipe or another account rather than rebasing the patch automatically.
Refusal checks require zero write attempts and no staged SQLite slot. Nine existing
cases retain lost-reply exact retry/reconciliation, old-account refusal, and explicit
conflict discard. These use injected HTTP and temporary SQLite; they are not hosted
provider or rendered-native evidence. The original source has not been executed
with the new tests, so no reproduced before-fix native failure is claimed.

Linux source-limit and diff checks pass. Initial29ee1515 strict Swift format,
Foundation and routine CI pass; its native step was cancelled when the source
update was pushed. The CLI X is not a test failure or a native pass. Exact8e711d65
passes [Nest37357189945](ci-routine.json) and [SwiftUI37357190102](ci-native.json):
496 Foundation cases/41 skips and438 signed-app cases/16 skips, zero failures,
strict format/limits/signing and guarded UI compilation. All22 targeted recipe
model cases execute in that native CI run; manual hosted UI journeys do not.
The creation fixture originally hardcoded revision3; its reply now derives the
exact increment from the requested revision and ingredient count. Production
receipt validation remains unchanged.

The authorized Mac is reachable again. Actual normal-session library navigation
passes twice. The first edited-draft check exposes36pt toolbar controls; the
new-recipe Cancel/Save now use the existing44pt Quiet toolbar primitive. The
second failure is the observer comparing43.99999999999999 against44; its tolerance
now accounts for floating-point representation without reducing the target.
The third failure occurs while the observer rereads an offscreen Name field after
Keep editing. Recorded video at235 seconds shows the form at its bottom; the
helper keeps scrolling down. The test now explicitly returns to the top before
reading every field in order. All three failures remain recorded; none counts
as a preservation/discard pass. The normal confirmation image shows the complete
short alert and both choices. The corrected normal preservation check passes in123.820 seconds. The first
maximum-text run fails before opening the recipe:40 small scrolls cannot reach
Saved meals below the taller seven-day board. Larger bounded gutter gestures
correct that observer; the maximum/dark preservation check passes in179.257
seconds. Six typed fields and default servings remain exact after Keep editing;
explicit Discard closes the form. [Execution evidence](native-executions.json)
retains eight executions:four passes (two library checks and the two corrected
draft cases), four failures (36pt target, floating-point comparison, offscreen
Name scrolling and insufficient maximum-text board scrolling). Test input changes
are distinguished by source-manifest hashes. The source manifest includes guarded
manual-week preparations; compiled files are not claimed to have executed.

[Normal confirmation](normal-confirmation.png) and [maximum confirmation](maximum-confirmation.png)
show complete choices and question. No positive recipe Save is pressed. Both
members retain64 empty native journals, original data/Keychain, stable test origins
and restored large/light settings. The two passing draft methods each assert Today
selection; failed runs do not prove navigation restoration. A complete real seven-day
manual week, hosted refusal/refresh and partner reads remain open. The guarded
positive creation method is compiled but has not executed. No hosted recipe/meal
write, production data, model call, purchase, beta publication or merge occurs.
