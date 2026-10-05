# Fresh native recipe write boundary

Status: implemented; native execution and rendered recovery are pending.

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
fields. Discard uses the short native alert, whose actual recipe rendering remains
unverified. A creation accepted into uncertain recovery is not claimed as a
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
Foundation and routine CI pass; signed-native execution is still live. The
follow-up editor refresh and dynamic fixture revisions await their own CI.
The creation fixture originally hardcoded the post-write revision3, which is
invalid for the new revision2 recovery case; its reply now derives the exact
revision increment from the requested revision and ingredient count. Production
receipt validation remains unchanged. No outcome is claimed until execution. The authorized owner Mac is currently
offline on Tailscale and SSH times out. Actual normal-session form input/keyboard,
refusal/refresh/discard, partner reads and a complete real seven-day manual week
remain open. No hosted recipe/meal write, personal or production data, model call,
purchase, beta publication or merge is performed in this increment.
