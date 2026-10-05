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

Eleven new AppTests cases cover unavailable libraries before staging, changed
revisions, changed edit/archive content at the same revision, account switches
during held reads, and new-recipe fresh-context recovery using the same draft.
Refusal checks require zero write attempts and no staged SQLite slot. Nine existing
cases retain lost-reply exact retry/reconciliation, old-account refusal, and explicit
conflict discard. These use injected HTTP and temporary SQLite; they are not hosted
provider or rendered-native evidence. The original source has not been executed
with the new tests, so no reproduced before-fix native failure is claimed.

Linux source-limit and diff checks pass. Swift compiler/format and actual execution
await the exact commit on the Mac CI runner. The authorized owner Mac is currently
offline on Tailscale and SSH times out. Actual normal-session form input/keyboard,
refusal/refresh/discard, partner reads and a complete real seven-day manual week
remain open. No hosted recipe/meal write, personal or production data, model call,
purchase, beta publication or merge is performed in this increment.
